import os from "node:os";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { userPreference } from "@/server/db/schema";
import {
  DEFAULT_MODEL,
  getActiveModel,
  listInstalledModels,
  setActiveModel,
} from "@/lib/ollama";
import {
  CATALOG,
  catalogByRef,
  fitFor,
  normalizeRef,
  TIER_ORDER,
  type CatalogModel,
  type FitVerdict,
  type ModelCapabilities,
  type ModelTier,
} from "@/lib/model-catalog";
import {
  MODEL_SURFACES,
  SURFACE_LIST,
  type ModelSurface,
} from "@/lib/model-routing";
import { resolveAllSurfaces } from "@/server/model-routing";

const HOST = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

/** A model as the manager sees it: catalog metadata merged with engine truth. */
interface ManagedModel {
  ref: string;
  label: string;
  family?: string;
  tier?: ModelTier;
  installed: boolean;
  selected: boolean;
  loaded: boolean;
  source: "engine" | "catalog";
  paramsB?: number;
  quant?: string;
  sizeBytes?: number;
  approxBytes?: number;
  contextTokens?: number;
  capabilities: ModelCapabilities;
  fit: FitVerdict;
  blurb?: string;
  note?: string;
}

const fallbackCaps: ModelCapabilities = {
  chat: true,
  tools: false,
  vision: false,
  embedding: false,
};

async function ollamaTags(): Promise<{ name: string; size?: number; digest?: string }[]> {
  const res = await fetch(`${HOST}/api/tags`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`Ollama responded HTTP ${res.status}`);
  const json = (await res.json()) as {
    models?: { name: string; size?: number; digest?: string }[];
  };
  return json.models ?? [];
}

async function ollamaLoaded(): Promise<string[]> {
  try {
    const res = await fetch(`${HOST}/api/ps`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: { name: string }[] };
    return (json.models ?? []).map((m) => normalizeRef(m.name));
  } catch {
    return [];
  }
}

/** Engine-truth capabilities/details from Ollama /api/show (best-effort). */
async function ollamaShow(name: string): Promise<{
  family?: string;
  paramsB?: number;
  quant?: string;
  contextTokens?: number;
  capabilities: ModelCapabilities;
} | null> {
  try {
    const res = await fetch(`${HOST}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      capabilities?: string[];
      details?: { family?: string; parameter_size?: string; quantization_level?: string };
      model_info?: Record<string, unknown>;
    };
    const caps = json.capabilities ?? [];
    const paramMatch = json.details?.parameter_size?.match(/([\d.]+)\s*B/i);
    let contextTokens: number | undefined;
    for (const [k, v] of Object.entries(json.model_info ?? {})) {
      if (k.endsWith(".context_length") && typeof v === "number") contextTokens = v;
    }
    return {
      family: json.details?.family,
      paramsB: paramMatch ? parseFloat(paramMatch[1]) : undefined,
      quant: json.details?.quantization_level,
      contextTokens,
      capabilities: {
        chat: caps.length === 0 || caps.includes("completion") || caps.includes("chat"),
        tools: caps.includes("tools"),
        vision: caps.includes("vision"),
        embedding: caps.includes("embedding"),
      },
    };
  } catch {
    return null;
  }
}

type ShowResult = Awaited<ReturnType<typeof ollamaShow>>;

/** Process-lifetime cache of /api/show, keyed by name+digest. A model's details
 *  are immutable for a given digest, so we only hit the engine once per build —
 *  not for every installed model on every list() / 30s refetch. */
const showCache = new Map<string, ShowResult>();

function sortModels(a: ManagedModel, b: ManagedModel): number {
  if (a.installed !== b.installed) return a.installed ? -1 : 1;
  const ta = a.tier ? TIER_ORDER.indexOf(a.tier) : TIER_ORDER.length;
  const tb = b.tier ? TIER_ORDER.indexOf(b.tier) : TIER_ORDER.length;
  if (ta !== tb) return ta - tb;
  return a.label.localeCompare(b.label);
}

export const modelsRouter = router({
  /** Total system memory (drives RAM-fit warnings). */
  system: protectedProcedure.query(() => ({
    totalMemoryBytes: os.totalmem(),
  })),

  /** The model AI actions use right now + the user's saved choice. */
  selected: protectedProcedure.query(async ({ ctx }) => {
    const pref = await ctx.db.query.userPreference.findFirst({
      where: eq(userPreference.userId, ctx.user.id),
      columns: { aiModel: true },
    });
    return {
      active: getActiveModel(),
      saved: pref?.aiModel ?? null,
      default: DEFAULT_MODEL,
    };
  }),

  /** Catalog ⨉ engine truth: installed + available models, with fit warnings. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const total = os.totalmem();
    const active = getActiveModel();

    let tags: { name: string; size?: number; digest?: string }[] = [];
    let reachable = true;
    let error: string | null = null;
    try {
      tags = await ollamaTags();
    } catch (err) {
      reachable = false;
      error = err instanceof Error ? err.message : String(err);
    }

    const loaded = reachable ? await ollamaLoaded() : [];
    const tagByName = new Map(tags.map((t) => [t.name, t]));

    // Engine-truth details for installed models — cached by name+digest, so
    // repeated list() polls don't re-hit /api/show for unchanged models.
    const details = new Map<string, ShowResult>();
    if (reachable) {
      await Promise.all(
        tags.map(async (t) => {
          const key = `${t.name}@${t.digest ?? ""}`;
          let d = showCache.get(key);
          if (d === undefined) {
            d = await ollamaShow(t.name);
            showCache.set(key, d);
          }
          details.set(t.name, d);
        }),
      );
    }

    const byRef = new Map<string, ManagedModel>();
    const consumed = new Set<string>();

    const build = (c: CatalogModel): ManagedModel => {
      const installedRef = normalizeRef(c.ref);
      const tag = tagByName.get(installedRef);
      if (tag) consumed.add(installedRef);
      const d = details.get(installedRef) ?? null;
      const caps = d ? { ...c.capabilities, ...d.capabilities } : c.capabilities;
      const sizeBytes = tag?.size ?? c.approxBytes;
      return {
        ref: c.ref,
        label: c.label,
        family: d?.family ?? c.family,
        tier: c.tier,
        installed: !!tag,
        selected: normalizeRef(c.ref) === normalizeRef(active),
        loaded: loaded.includes(installedRef),
        source: "catalog",
        paramsB: d?.paramsB ?? c.paramsB,
        quant: d?.quant ?? c.quant,
        sizeBytes: tag?.size,
        approxBytes: c.approxBytes,
        contextTokens: d?.contextTokens ?? c.contextTokens,
        capabilities: caps,
        fit: fitFor(sizeBytes, total),
        blurb: c.blurb,
        note: c.note,
      };
    };

    for (const c of CATALOG) byRef.set(c.ref, build(c));

    // Installed models the catalog doesn't list (user pulled them directly).
    for (const t of tags) {
      if (consumed.has(normalizeRef(t.name))) continue;
      const d = details.get(t.name) ?? null;
      byRef.set(t.name, {
        ref: t.name,
        label: t.name,
        family: d?.family,
        installed: true,
        selected: normalizeRef(t.name) === normalizeRef(active),
        loaded: loaded.includes(normalizeRef(t.name)),
        source: "engine",
        paramsB: d?.paramsB,
        quant: d?.quant,
        sizeBytes: t.size,
        contextTokens: d?.contextTokens,
        capabilities: d?.capabilities ?? fallbackCaps,
        fit: fitFor(t.size, total),
      });
    }

    return {
      reachable,
      error,
      host: HOST,
      totalMemoryBytes: total,
      active,
      models: [...byRef.values()].sort(sortModels),
      installedCount: tags.length,
    };
  }),

  /** Switch the active model: validate it's installed, persist, flip, warm. */
  setSelected: protectedProcedure
    .input(z.object({ model: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const model = input.model.trim();
      // Guard against selecting a model that isn't pulled (every AI call would
      // then fail). Skip the check only when the engine is unreachable (so we
      // can't verify) — trust the caller in that case.
      const installed = await listInstalledModels();
      if (installed.length > 0 && !installed.includes(normalizeRef(model))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${model}" isn't installed yet — pull it first.`,
        });
      }
      await ctx.db
        .insert(userPreference)
        .values({ userId: ctx.user.id, aiModel: model })
        .onConflictDoUpdate({
          target: userPreference.userId,
          set: { aiModel: model, updatedAt: new Date() },
        });
      setActiveModel(model);
      // Don't preload here — the model loads lazily on the next AI action, so
      // just picking a model never pins it in memory.
      return { active: getActiveModel() };
    }),

  /** Delete an installed model from the engine. If it was the active model,
   *  repoint to another installed one so AI doesn't break. */
  remove: protectedProcedure
    .input(z.object({ ref: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const ref = input.ref.trim();
      const res = await fetch(`${HOST}/api/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ref }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Ollama responded HTTP ${res.status}`);

      if (normalizeRef(getActiveModel()) === normalizeRef(ref)) {
        const installed = await listInstalledModels();
        const next = installed.includes(normalizeRef(DEFAULT_MODEL))
          ? DEFAULT_MODEL
          : installed[0];
        if (next) {
          setActiveModel(next);
          await ctx.db
            .insert(userPreference)
            .values({ userId: ctx.user.id, aiModel: next })
            .onConflictDoUpdate({
              target: userPreference.userId,
              set: { aiModel: next, updatedAt: new Date() },
            });
        }
      }
      return { ok: true, active: getActiveModel() };
    }),

  // ── Per-surface routing (#11) + Auto routing (#12) ────────────────────────

  /** Per-surface model assignments + Auto toggle + the model each resolves to. */
  surfacePrefs: protectedProcedure.query(async ({ ctx }) => {
    const pref = await ctx.db.query.userPreference.findFirst({
      where: eq(userPreference.userId, ctx.user.id),
      columns: { surfaceModels: true, autoRouteModels: true },
    });
    return {
      surfaces: SURFACE_LIST,
      overrides: pref?.surfaceModels ?? {},
      autoRoute: pref?.autoRouteModels ?? false,
      resolved: await resolveAllSurfaces(ctx.user.id),
    };
  }),

  /** Pin (or clear, model:null) the model for one AI surface. */
  setSurfaceModel: protectedProcedure
    .input(
      z.object({
        surface: z.enum(MODEL_SURFACES as unknown as [string, ...string[]]),
        model: z.string().min(1).max(120).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const model = input.model?.trim() || null;
      if (model) {
        const installed = await listInstalledModels();
        if (installed.length > 0 && !installed.includes(normalizeRef(model))) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${model}" isn't installed yet — pull it first.`,
          });
        }
      }
      await ctx.db
        .insert(userPreference)
        .values({ userId: ctx.user.id })
        .onConflictDoNothing();
      const current = await ctx.db.query.userPreference.findFirst({
        where: eq(userPreference.userId, ctx.user.id),
        columns: { surfaceModels: true },
      });
      const next = { ...(current?.surfaceModels ?? {}) };
      if (model) next[input.surface] = model;
      else delete next[input.surface];
      await ctx.db
        .update(userPreference)
        .set({ surfaceModels: next, updatedAt: new Date() })
        .where(eq(userPreference.userId, ctx.user.id));
      return { overrides: next };
    }),

  /** Enable/disable Auto routing for surfaces without an explicit override. */
  setAutoRoute: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userPreference)
        .values({ userId: ctx.user.id, autoRouteModels: input.enabled })
        .onConflictDoUpdate({
          target: userPreference.userId,
          set: { autoRouteModels: input.enabled, updatedAt: new Date() },
        });
      return { autoRoute: input.enabled };
    }),
});

// Re-export so the surface union is importable from the router barrel if needed.
export type { ModelSurface };

"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";

/**
 * Per-surface model routing (#11) + Auto routing (#12).
 *
 * Each AI surface (chat, epic break-down, board planner, …) can be pinned to a
 * specific installed model, left on "Auto" (best installed model for the task,
 * when Auto routing is on), or left to fall through to the global active model.
 * The resolved model for each surface is shown so the effect is obvious.
 */
export function SurfaceRoutingCard() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.models.surfacePrefs.useQuery();
  const { data: list } = trpc.models.list.useQuery();
  const installed = (list?.models ?? []).filter((m) => m.installed);

  const invalidate = () => {
    utils.models.surfacePrefs.invalidate();
  };

  const setSurface = trpc.models.setSurfaceModel.useMutation({
    onSuccess: invalidate,
    onError: (e) =>
      toast({ title: "Couldn't pin model", description: e.message, variant: "error" }),
  });
  const setAuto = trpc.models.setAutoRoute.useMutation({
    onSuccess: () => {
      invalidate();
    },
    onError: (e) =>
      toast({ title: "Couldn't toggle Auto", description: e.message, variant: "error" }),
  });

  const overrides = (data?.overrides ?? {}) as Record<string, string>;
  const resolved = (data?.resolved ?? {}) as Record<string, string>;
  const autoRoute = data?.autoRoute ?? false;

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-trails-accent" />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Per-feature models
          </h2>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-trails-fg-dim">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Auto-route
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoRoute}
            aria-label="Toggle Auto routing"
            onClick={() => setAuto.mutate({ enabled: !autoRoute })}
            disabled={setAuto.isPending}
            className={
              "relative inline-flex h-5 w-9 items-center rounded-full border transition disabled:opacity-50 " +
              (autoRoute
                ? "border-trails-good bg-trails-good/30"
                : "border-trails-trim/40 bg-trails-bg-deep/60")
            }
          >
            <span
              className={
                "inline-block h-3.5 w-3.5 transform rounded-full shadow transition " +
                (autoRoute ? "translate-x-4 bg-trails-good" : "translate-x-0.5 bg-trails-fg-dim")
              }
            />
          </button>
        </label>
      </div>

      <p className="mt-1 text-xs text-trails-fg-dim">
        Pick a model per feature, or leave it on <strong>Auto</strong>
        {autoRoute ? "" : " (off → uses the global active model)"}. Pinned models
        always win. 100% local.
      </p>

      {isLoading ? (
        <p className="mt-3 text-sm text-trails-fg-dim">Loading…</p>
      ) : (
        <ul className="mt-3 divide-y divide-trails-trim/30">
          {(data?.surfaces ?? []).map((s) => {
            const value = overrides[s.surface] ?? "";
            return (
              <li
                key={s.surface}
                className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0">
                  <p className="font-display text-[12px] uppercase tracking-wider text-trails-fg">
                    {s.label}
                  </p>
                  <p className="text-[11px] text-trails-fg-dim">{s.hint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={value}
                    onChange={(e) =>
                      setSurface.mutate({
                        surface: s.surface,
                        model: e.target.value || null,
                      })
                    }
                    disabled={setSurface.isPending}
                    className="rounded-md border border-trails-trim/60 bg-trails-panel-dark px-2 py-1 text-xs disabled:opacity-50"
                  >
                    <option value="">
                      {autoRoute ? "Auto" : "Default (global)"}
                    </option>
                    {installed.map((m) => (
                      <option key={m.ref} value={m.ref}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span
                    title="Model this feature resolves to right now"
                    className="hidden whitespace-nowrap font-mono text-[10px] text-trails-fg-dim md:inline"
                  >
                    → {resolved[s.surface] ?? "—"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

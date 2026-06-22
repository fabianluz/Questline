"use client";

import {
  Briefcase,
  CheckCircle2,
  Circle,
  Coins,
  CreditCard,
  Flame,
  Mountain,
  Receipt,
  ScrollText,
  Sparkles,
  Star,
  Swords,
  Tag,
  Target,
  Wallet,
} from "lucide-react";
import type { ProfileJson } from "@/lib/json-shapes";

/**
 * Read-only hierarchical render of a ProfileJson — shown next to the
 * compact `summarizeImport` rows on /ai/serialize + /ai/commit so the
 * user can see EXACTLY how the import will look in the app, item by
 * item, before they commit.
 *
 * Layout mirrors the actual screens the user will visit afterwards:
 *   Categories     → like /categories
 *   Skills         → like /skills
 *   Epics          → like /epics/[id]  (milestones grouped by tier)
 *   Quests         → like /quests
 *   Inventory      → like /inventory (accounts / bills / goals)
 *
 * Every item is enumerated — no truncation. For huge profiles the user
 * can scroll the panel.
 */
export function ProfileFinalView({ profile }: { profile: ProfileJson }) {
  const totalMilestones = profile.epics.reduce(
    (sum, e) => sum + e.milestones.length,
    0,
  );
  const totalSteps = profile.epics.reduce(
    (sum, e) =>
      sum + e.milestones.reduce((s2, m) => s2 + m.steps.length, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <header className="border-b border-trails-trim/30 pb-2">
        <h3 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
          Final view — what your app will look like
        </h3>
        <p className="mt-1 text-[11px] text-trails-fg-dim">
          Every entity below will be created on import. Read it like a
          rehearsal of the screens you'll see after committing.
        </p>
      </header>

      {/* ── Categories ─────────────────────────────────────────── */}
      <Section
        icon={<Tag className="h-3.5 w-3.5" />}
        label={`Categories · ${profile.categories.length}`}
      >
        {profile.categories.length === 0 ? (
          <Empty>No categories.</Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {profile.categories.map((c, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border border-trails-trim/30 px-2 py-1 text-xs"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-2 ring-trails-trim/30"
                  style={{ background: c.color }}
                  title={c.color}
                />
                <span className="truncate text-trails-fg">{c.name}</span>
                <span className="ml-auto font-mono text-[10px] text-trails-fg-dim">
                  {c.color}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Skills ─────────────────────────────────────────────── */}
      <Section
        icon={<Star className="h-3.5 w-3.5" />}
        label={`Skills · ${profile.skills.length}`}
      >
        {profile.skills.length === 0 ? (
          <Empty>No skills.</Empty>
        ) : (
          <ul className="space-y-1">
            {profile.skills.map((s, i) => (
              <li
                key={i}
                className="rounded-md border border-trails-trim/30 px-2 py-1 text-xs"
              >
                <div className="flex items-baseline gap-2">
                  <Sparkles className="h-3 w-3 shrink-0 text-trails-accent" />
                  <span className="font-medium text-trails-fg">{s.name}</span>
                </div>
                {s.description && (
                  <p className="ml-5 text-[11px] text-trails-fg-dim">
                    {s.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Epics + milestones (the headline section) ────────────── */}
      <Section
        icon={<Mountain className="h-3.5 w-3.5" />}
        label={`Epics · ${profile.epics.length} · ${totalMilestones} milestones${
          totalSteps > 0 ? ` · ${totalSteps} steps` : ""
        }`}
      >
        {profile.epics.length === 0 ? (
          <Empty>No epics.</Empty>
        ) : (
          <ol className="space-y-3">
            {profile.epics.map((e, i) => (
              <EpicCard key={i} epic={e} />
            ))}
          </ol>
        )}
      </Section>

      {/* ── Quests ─────────────────────────────────────────────── */}
      <Section
        icon={<Swords className="h-3.5 w-3.5" />}
        label={`Quests · ${profile.quests.length}`}
      >
        {profile.quests.length === 0 ? (
          <Empty>No quests.</Empty>
        ) : (
          <ul className="space-y-1">
            {profile.quests.map((q, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border border-trails-trim/30 px-2 py-1 text-xs"
              >
                <Flame className="h-3 w-3 shrink-0 text-trails-warn" />
                <span className="truncate font-medium text-trails-fg">
                  {q.title}
                </span>
                <CadenceChip cadence={q.cadence} />
                {q.difficulty && <DifficultyChip difficulty={q.difficulty} />}
                <span className="ml-auto font-mono text-[10px] text-trails-fg-dim">
                  +{q.xpReward} XP{q.skill ? ` → ${q.skill}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Inventory ──────────────────────────────────────────── */}
      <Section
        icon={<Briefcase className="h-3.5 w-3.5" />}
        label={`Inventory · ${profile.accounts.length} accounts · ${profile.bills.length} bills · ${profile.goals.length} goals`}
      >
        {profile.accounts.length === 0 &&
        profile.bills.length === 0 &&
        profile.goals.length === 0 ? (
          <Empty>No financial entries.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InventorySub icon={<Wallet className="h-3 w-3" />} label="Accounts">
              {profile.accounts.length === 0 ? (
                <Empty>—</Empty>
              ) : (
                <ul className="space-y-0.5">
                  {profile.accounts.map((a, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-2 text-[11px]"
                    >
                      <span className="inline-flex items-center gap-1 truncate">
                        {a.kind === "asset" ? (
                          <Coins className="h-2.5 w-2.5 shrink-0 text-trails-good" />
                        ) : (
                          <CreditCard className="h-2.5 w-2.5 shrink-0 text-trails-bad" />
                        )}
                        <span className="truncate">{a.name}</span>
                      </span>
                      <span
                        className={`shrink-0 font-mono tabular-nums ${
                          a.kind === "liability"
                            ? "text-trails-bad"
                            : "text-trails-fg-dim"
                        }`}
                      >
                        {(a.balanceCents / 100).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {a.currency}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InventorySub>

            <InventorySub icon={<Receipt className="h-3 w-3" />} label="Bills">
              {profile.bills.length === 0 ? (
                <Empty>—</Empty>
              ) : (
                <ul className="space-y-0.5">
                  {profile.bills.map((b, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-2 text-[11px]"
                    >
                      <span className="truncate text-trails-fg">{b.name}</span>
                      <span className="shrink-0 font-mono tabular-nums text-trails-warn">
                        {(b.amountCents / 100).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {b.currency}/{b.cadence[0]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </InventorySub>

            <InventorySub icon={<Target className="h-3 w-3" />} label="Goals">
              {profile.goals.length === 0 ? (
                <Empty>—</Empty>
              ) : (
                <ul className="space-y-0.5">
                  {profile.goals.map((g, i) => {
                    const pct =
                      g.targetCents > 0
                        ? Math.round((g.currentCents / g.targetCents) * 100)
                        : 0;
                    return (
                      <li
                        key={i}
                        className="space-y-0.5 text-[11px]"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-trails-fg">
                            {g.name}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-trails-fg-dim">
                            {(g.targetCents / 100).toLocaleString()}{" "}
                            {g.currency}
                          </span>
                        </div>
                        <div className="relative h-1 overflow-hidden rounded-full border border-trails-trim/30">
                          <div
                            className="absolute inset-y-0 left-0 bg-trails-accent"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        {g.epic && (
                          <p className="text-[10px] text-trails-accent">
                            → {g.epic}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </InventorySub>
          </div>
        )}
      </Section>

      {profile.preferences && (
        <Section
          icon={<ScrollText className="h-3.5 w-3.5" />}
          label="Preferences"
        >
          <ul className="space-y-0.5 rounded-md border border-trails-trim/30 p-2 text-[11px]">
            <li>
              Work window:{" "}
              <code className="font-mono text-trails-accent">
                {profile.preferences.workWindowStart} –{" "}
                {profile.preferences.workWindowEnd}
              </code>
            </li>
            <li>
              Work days mask:{" "}
              <code className="font-mono text-trails-accent">
                {profile.preferences.workWindowDays}
              </code>
            </li>
            <li>
              Default step duration:{" "}
              <code className="font-mono text-trails-accent">
                {profile.preferences.defaultStepDurationMin} min
              </code>
            </li>
          </ul>
        </Section>
      )}
    </div>
  );
}

function EpicCard({ epic }: { epic: ProfileJson["epics"][number] }) {
  // Group milestones by tier so the user reads parallel tracks together.
  const byTier = new Map<number, typeof epic.milestones>();
  for (const m of [...epic.milestones].sort(
    (a, b) => a.tier - b.tier || a.position - b.position,
  )) {
    const arr = byTier.get(m.tier) ?? [];
    arr.push(m);
    byTier.set(m.tier, arr);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);

  return (
    <li className="rounded-md border border-trails-trim/40 bg-trails-bg-deep/40 p-2">
      <header className="flex flex-wrap items-baseline gap-2">
        <Mountain className="h-3 w-3 shrink-0 text-trails-info" />
        <span className="font-medium text-trails-fg">{epic.title}</span>
        <StatusChip status={epic.status} />
        {epic.category && (
          <span className="rounded-full border border-trails-trim/40 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider text-trails-accent">
            {epic.category}
          </span>
        )}
        {epic.targetDate && (
          <span className="font-mono text-[10px] text-trails-fg-dim">
            → {epic.targetDate}
          </span>
        )}
      </header>
      {epic.description && (
        <p className="ml-5 text-[11px] text-trails-fg-dim">
          {epic.description}
        </p>
      )}

      {tiers.length === 0 ? (
        <Empty>No milestones.</Empty>
      ) : (
        <div className="mt-2 ml-5 space-y-2 border-l border-trails-trim/30 pl-3">
          {tiers.map((tier) => {
            const ms = byTier.get(tier)!;
            return (
              <div key={tier}>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="font-display text-[10px] uppercase tracking-widest text-trails-accent">
                    Tier {tier}
                  </span>
                  {ms.length > 1 && (
                    <span className="rounded-full border border-trails-info/40 px-1.5 py-0 font-display text-[8px] uppercase tracking-wider text-trails-info">
                      ⇉ parallel
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {ms.map((m, i) => (
                    <MilestoneItem key={i} m={m} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}

function MilestoneItem({
  m,
}: {
  m: ProfileJson["epics"][number]["milestones"][number];
}) {
  const Icon = m.status === "completed" ? CheckCircle2 : Circle;
  return (
    <li className="rounded-md border border-trails-trim/20 bg-trails-bg-glow/20 p-1.5">
      <div className="flex items-baseline gap-1.5 text-xs">
        <Icon
          className={
            "mt-0.5 h-3 w-3 shrink-0 " +
            (m.status === "completed"
              ? "text-trails-good"
              : "text-trails-fg-dim")
          }
        />
        <span className="font-medium text-trails-fg">{m.title}</span>
        {m.estimatedAchievementDate && (
          <span className="font-mono text-[10px] text-trails-fg-dim">
            {m.estimatedStartDate ? `${m.estimatedStartDate} → ` : "→ "}
            {m.estimatedAchievementDate}
          </span>
        )}
      </div>
      {m.description && (
        <p className="ml-4 text-[10px] text-trails-fg-dim">{m.description}</p>
      )}
      {m.skills.length > 0 && (
        <p className="ml-4 mt-1 flex flex-wrap items-center gap-1 text-[10px]">
          {m.skills.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 rounded-full border border-trails-accent/40 bg-trails-accent/15 px-1.5 py-0 text-trails-accent"
            >
              <Sparkles className="h-2 w-2" /> {s}
            </span>
          ))}
        </p>
      )}
      {m.steps.length > 0 && (
        <ul className="ml-4 mt-1 list-disc space-y-0 pl-3 text-[10px] text-trails-fg-dim">
          {m.steps.map((s, i) => (
            <li
              key={i}
              className={s.isCompleted ? "text-trails-good line-through" : ""}
            >
              {s.title}
            </li>
          ))}
        </ul>
      )}
      {m.resources.length > 0 && (
        <ul className="ml-4 mt-1 list-none space-y-0 pl-0 text-[10px] text-trails-fg-dim">
          {m.resources.map((r, i) => (
            <li key={i} className="flex items-baseline gap-1">
              <span className="font-mono text-[9px] uppercase text-trails-accent/80">
                ({r.kind})
              </span>
              <span>{r.label}</span>
              {r.url && (
                <span className="truncate font-mono text-[9px] text-trails-fg-dim">
                  · {r.url}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "border-trails-good/60 text-trails-good"
      : status === "in_progress"
        ? "border-trails-info/60 text-trails-info"
        : status === "paused"
          ? "border-trails-warn/60 text-trails-warn"
          : status === "abandoned"
            ? "border-trails-bad/60 text-trails-bad"
            : "border-trails-trim/40 text-trails-fg-dim";
  return (
    <span
      className={
        "rounded-full border px-1.5 py-0 font-display text-[9px] uppercase tracking-wider " +
        cls
      }
    >
      {status.replace("_", " ")}
    </span>
  );
}

function CadenceChip({ cadence }: { cadence: string }) {
  const cls =
    cadence === "daily"
      ? "border-trails-good/60 text-trails-good"
      : cadence === "weekly"
        ? "border-trails-info/60 text-trails-info"
        : "border-trails-warn/60 text-trails-warn"; // one_off
  return (
    <span
      className={
        "rounded-full border px-1.5 py-0 font-display text-[9px] uppercase tracking-wider " +
        cls
      }
    >
      {cadence === "one_off" ? "side quest" : cadence}
    </span>
  );
}

function DifficultyChip({ difficulty }: { difficulty: string }) {
  const cls =
    difficulty === "hard"
      ? "border-trails-bad/60 text-trails-bad"
      : difficulty === "normal"
        ? "border-trails-info/60 text-trails-info"
        : "border-trails-fg-dim/40 text-trails-fg-dim";
  return (
    <span
      className={
        "rounded-full border px-1.5 py-0 font-display text-[9px] uppercase tracking-wider " +
        cls
      }
    >
      {difficulty}
    </span>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="!m-0 !border-0 !p-0 mb-1.5 flex items-center gap-1.5 font-display text-[11px] uppercase tracking-widest text-trails-accent">
        <span className="text-trails-accent">{icon}</span>
        {label}
      </h4>
      {children}
    </section>
  );
}

function InventorySub({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-trails-trim/30 p-2">
      <h5 className="!m-0 !border-0 !p-0 mb-1 flex items-center gap-1 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim">
        {icon}
        {label}
      </h5>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] italic text-trails-fg-dim">{children}</p>;
}

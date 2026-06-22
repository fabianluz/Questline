"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, Coins, Compass, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { RelativeDate } from "@/components/relative-date";

/** Local YYYY-MM-DD (date columns are plain strings, so we compare lexically). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const money = (cents: number) =>
  `€${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * "Today / Next up" — the single most useful glance on the dashboard.
 * Surfaces what the user can act on right now: unlocked milestones, anything
 * overdue, and bills landing this week. Pure read; no mutations.
 */
export function TodayHubCard() {
  const { data: tree } = trpc.tree.get.useQuery();
  const { data: bills } = trpc.inventory.bills.list.useQuery();

  const today = todayISO();
  const weekEnd = addDaysISO(7);

  const epicTitle = new Map((tree?.epics ?? []).map((e) => [e.id, e.title]));
  const milestones = tree?.milestones ?? [];

  const open = milestones.filter(
    (m) => m.status !== "completed" && m.status !== "abandoned",
  );

  const available = open
    .filter((m) => !m.isLocked)
    .sort((a, b) =>
      (a.estimatedAchievementDate ?? "9999").localeCompare(
        b.estimatedAchievementDate ?? "9999",
      ),
    )
    .slice(0, 5);

  const overdue = open
    .filter((m) => m.estimatedAchievementDate && m.estimatedAchievementDate < today)
    .sort((a, b) =>
      (a.estimatedAchievementDate ?? "").localeCompare(b.estimatedAchievementDate ?? ""),
    )
    .slice(0, 5);

  const starting = open
    .filter(
      (m) =>
        m.estimatedStartDate &&
        m.estimatedStartDate >= today &&
        m.estimatedStartDate <= weekEnd,
    )
    .sort((a, b) =>
      (a.estimatedStartDate ?? "").localeCompare(b.estimatedStartDate ?? ""),
    )
    .slice(0, 5);

  const billsDue = (bills ?? [])
    .filter((b) => b.nextDueDate && b.nextDueDate >= today && b.nextDueDate <= weekEnd)
    .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""))
    .slice(0, 5);

  const empty =
    available.length === 0 &&
    overdue.length === 0 &&
    starting.length === 0 &&
    billsDue.length === 0;

  return (
    <section className="jrpg-panel p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-trails-accent" aria-hidden />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Today · Next up
          </h2>
        </div>
        <Link
          href="/journal"
          className="font-display text-[11px] uppercase tracking-widest text-trails-fg-dim hover:text-trails-accent"
        >
          Plan today →
        </Link>
      </div>

      {empty ? (
        <p className="text-sm text-trails-fg-dim">
          Nothing pressing. Open the{" "}
          <Link href="/tree" className="text-trails-accent underline">
            Skill Tree
          </Link>{" "}
          to pick your next milestone.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overdue.length > 0 && (
            <HubColumn
              icon={<AlertTriangle className="h-3.5 w-3.5 text-trails-bad" aria-hidden />}
              title="Overdue"
              accent="text-trails-bad"
            >
              {overdue.map((m) => (
                <HubRow
                  key={m.id}
                  href={`/epics/${m.epicId}`}
                  label={m.title}
                  sub={epicTitle.get(m.epicId) ?? "Epic"}
                  chip={<RelativeDate date={m.estimatedAchievementDate} />}
                />
              ))}
            </HubColumn>
          )}

          <HubColumn
            icon={<Sparkles className="h-3.5 w-3.5 text-trails-good" aria-hidden />}
            title="Available now"
            accent="text-trails-good"
          >
            {available.length === 0 ? (
              <p className="text-xs text-trails-fg-dim">All unlocked work is done.</p>
            ) : (
              available.map((m) => (
                <HubRow
                  key={m.id}
                  href={`/epics/${m.epicId}`}
                  label={m.title}
                  sub={`${epicTitle.get(m.epicId) ?? "Epic"}${
                    m.stepProgress.total > 0
                      ? ` · ${m.stepProgress.completed}/${m.stepProgress.total} steps`
                      : ""
                  }`}
                />
              ))
            )}
          </HubColumn>

          {starting.length > 0 && (
            <HubColumn
              icon={<CalendarClock className="h-3.5 w-3.5 text-trails-info" aria-hidden />}
              title="Starting this week"
              accent="text-trails-info"
            >
              {starting.map((m) => (
                <HubRow
                  key={m.id}
                  href={`/epics/${m.epicId}`}
                  label={m.title}
                  sub={epicTitle.get(m.epicId) ?? "Epic"}
                  chip={<RelativeDate date={m.estimatedStartDate} />}
                />
              ))}
            </HubColumn>
          )}

          {billsDue.length > 0 && (
            <HubColumn
              icon={<Coins className="h-3.5 w-3.5 text-jrpg-gold" aria-hidden />}
              title="Bills this week"
              accent="text-jrpg-gold"
            >
              {billsDue.map((b) => (
                <HubRow
                  key={b.id}
                  href="/inventory"
                  label={b.name}
                  sub={money(b.amountCents)}
                  chip={<RelativeDate date={b.nextDueDate} />}
                  icon={<CalendarClock className="h-3 w-3 text-trails-fg-dim" aria-hidden />}
                />
              ))}
            </HubColumn>
          )}
        </div>
      )}
    </section>
  );
}

function HubColumn({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`mb-1.5 flex items-center gap-1.5 font-display text-[11px] uppercase tracking-widest ${accent}`}>
        {icon}
        {title}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function HubRow({
  href,
  label,
  sub,
  icon,
  chip,
}: {
  href: string;
  label: string;
  sub: string;
  icon?: React.ReactNode;
  chip?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-md border border-trails-trim/30 bg-trails-panel-dark/40 px-2 py-1.5 hover:border-trails-accent/50"
      >
        <div className="flex items-center gap-1.5 text-sm text-trails-fg">
          {icon}
          <span className="flex-1 truncate">{label}</span>
          {chip}
        </div>
        <div className="truncate text-[11px] text-trails-fg-dim">{sub}</div>
      </Link>
    </li>
  );
}

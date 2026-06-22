"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, Circle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { computeUrgency } from "@/lib/urgency";

/**
 * §3 — Category-Specific Roadmap. Dedicated route per category that isolates
 * a single skill path from basic to advanced. Complementary to the global
 * /roadmap page (which aggregates all categories with parallel-execution
 * track stacking).
 */
export default function CategoryRoadmapPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = use(params);
  const { data, isLoading } = trpc.tree.get.useQuery();
  const { data: categories } = trpc.category.list.useQuery();

  const view = useMemo(() => {
    if (!data) return null;
    const epicsInCat = data.epics.filter(
      (e) => e.categoryId === categoryId,
    );
    if (epicsInCat.length === 0) return { epics: [] as const, milestones: [] as const };
    const epicIds = new Set(epicsInCat.map((e) => e.id));
    const milestones = data.milestones
      .filter((m) => epicIds.has(m.epicId))
      .sort((a, b) => {
        // Sort by date asc, then tier asc, then position asc.
        const dateA = a.estimatedAchievementDate ?? "9999-12-31";
        const dateB = b.estimatedAchievementDate ?? "9999-12-31";
        if (dateA !== dateB) return dateA < dateB ? -1 : 1;
        if (a.tier !== b.tier) return a.tier - b.tier;
        return a.position - b.position;
      });
    return { epics: epicsInCat, milestones };
  }, [data, categoryId]);

  const category = categories?.find((c) => c.id === categoryId) ?? null;

  if (isLoading || !view) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          <ChevronLeft className="h-3 w-3" />
          All categories
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold">
          {category && (
            <span
              className="inline-block h-4 w-4 rounded-full"
              style={{ background: category.color }}
            />
          )}
          {category?.name ?? "Unknown category"} · Roadmap
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {view.epics.length} epic{view.epics.length === 1 ? "" : "s"},{" "}
          {view.milestones.length} milestones
        </p>
      </header>

      {view.epics.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No epics in this category yet.
        </p>
      ) : (
        <div className="space-y-6">
          {view.epics.map((e) => {
            const ms = view.milestones.filter((m) => m.epicId === e.id);
            return (
              <section
                key={e.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{e.title}</h2>
                  <Link
                    href={`/epics/${e.id}`}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                  >
                    Open →
                  </Link>
                </div>
                {ms.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    No milestones yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {ms.map((m) => {
                      const urg = computeUrgency({
                        estimatedAchievementDate:
                          m.estimatedAchievementDate ?? null,
                        status: m.status,
                      });
                      const Icon =
                        m.status === "completed" ? CheckCircle2 : Circle;
                      return (
                        <li
                          key={m.id}
                          className={`flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm urgency-${urg}`}
                        >
                          <Icon
                            className={
                              "h-3.5 w-3.5 shrink-0 " +
                              (m.status === "completed"
                                ? "text-emerald-500"
                                : urg === "burning"
                                  ? "text-rose-500"
                                  : urg === "imminent"
                                    ? "text-amber-500"
                                    : "text-zinc-400")
                            }
                          />
                          <span className="text-[10px] text-zinc-400">
                            T{m.tier}
                          </span>
                          <span className="flex-1 truncate">{m.title}</span>
                          {m.estimatedAchievementDate && (
                            <span className="tabular-nums text-[10px] text-zinc-500">
                              {m.estimatedStartDate
                                ? `${m.estimatedStartDate} → ${m.estimatedAchievementDate}`
                                : m.estimatedAchievementDate}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

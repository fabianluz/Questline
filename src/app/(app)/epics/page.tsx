"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, HelpCircle, Mountain, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { EntityIoControls } from "@/components/entity-io-controls";

const statusLabel: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  paused: "Paused",
  abandoned: "Abandoned",
};

const statusClass: Record<string, string> = {
  not_started: "text-trails-fg-dim",
  in_progress: "text-trails-info",
  completed: "text-trails-good",
  paused: "text-trails-warn",
  abandoned: "text-trails-bad",
};

const statusDot: Record<string, string> = {
  not_started: "bg-trails-trim-soft",
  in_progress: "bg-trails-info",
  completed: "bg-trails-good",
  paused: "bg-trails-warn",
  abandoned: "bg-trails-bad",
};

type EpicMilestone = {
  id: string;
  title: string;
  status: string;
  tier: number;
  position: number;
};

/**
 * A compact, aesthetic branch-tree of an Epic's milestones — a vertical
 * trunk with a tick + status dot per milestone, ordered by tier then
 * position. Completed milestones read struck-through and dimmed.
 */
function EpicMilestoneTree({ milestones }: { milestones: EpicMilestone[] }) {
  if (milestones.length === 0) return null;
  const sorted = [...milestones].sort(
    (a, b) => a.tier - b.tier || a.position - b.position,
  );
  const MAX = 10;
  const shown = sorted.slice(0, MAX);
  const rest = sorted.length - shown.length;
  return (
    <div className="relative mt-2 ml-1">
      {/* trunk */}
      <span
        className="absolute left-[5px] top-1.5 bottom-2.5 w-px bg-trails-trim/40"
        aria-hidden
      />
      <ul className="space-y-1">
        {shown.map((m) => (
          <li key={m.id} className="relative flex items-center gap-2 pl-4">
            {/* branch tick */}
            <span
              className="absolute left-[5px] top-1/2 h-px w-2.5 bg-trails-trim/40"
              aria-hidden
            />
            <span
              className={cn(
                "relative z-10 h-2 w-2 shrink-0 rounded-full ring-2 ring-trails-bg-deep",
                statusDot[m.status] ?? "bg-trails-trim-soft",
              )}
              title={statusLabel[m.status] ?? m.status}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[11px]",
                m.status === "completed"
                  ? "text-trails-fg-dim line-through"
                  : "text-trails-fg",
              )}
            >
              {m.title}
            </span>
            <span className="shrink-0 font-display text-[8px] uppercase tracking-wider text-trails-fg-dim opacity-70">
              T{m.tier}
            </span>
          </li>
        ))}
        {rest > 0 && (
          <li className="pl-4 text-[10px] italic text-trails-fg-dim">
            +{rest} more milestone{rest === 1 ? "" : "s"}…
          </li>
        )}
      </ul>
    </div>
  );
}

export default function EpicsPage() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const toast = useToast();
  const { data: epics, isLoading } = trpc.epic.list.useQuery();
  const { data: categories } = trpc.category.list.useQuery();

  const invalidate = () => {
    utils.epic.list.invalidate();
    utils.tree.get.invalidate();
  };

  const createEpic = trpc.epic.create.useMutation({
    onSuccess: (created) => {
      invalidate();
      setTitle("");
      setDescription("");
      setTargetDate("");
      setCategoryId("");
      toast({
        title: "Epic created",
        description: created.title,
        variant: "success",
        action: {
          label: "View →",
          onClick: () => router.push(`/epics/${created.id}`),
        },
      });
    },
  });
  const deleteEpic = trpc.epic.delete.useMutation({ onSuccess: invalidate });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createEpic.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      targetDate: targetDate || undefined,
      categoryId: categoryId || undefined,
    });
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Mountain className="h-5 w-5 text-trails-accent" />
            Epics
            <span
              title="Long-term priorities — months-to-years scoped ambitions. Each Epic breaks down into Milestones, which in turn carry Steps + Resources + Skills. Tagging an Epic with a Category color-codes it everywhere (Skill Tree, Roadmap, per-category roadmap)."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Open an Epic to add milestones, set deadlines, and ask the AI Guide
            to break it down.
          </p>
        </div>
        <EntityIoControls shape="epic" />
      </header>

      <form onSubmit={onCreate} className="rounded-lg border p-4">
        <h2 className="!m-0 !border-0 !p-0 text-sm">New Epic</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Title (e.g. Master Japanese)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-md px-3 py-2 text-sm"
            title="Color-code this Epic by Category"
          >
            <option value="">— no category —</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            title="Optional aspirational date when you'd like to finish this Epic"
            className="rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={createEpic.isPending || !title.trim()}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2"
          >
            {createEpic.isPending ? "Creating..." : "Create Epic"}
          </button>
        </div>
        {categories && categories.length === 0 && (
          <p className="mt-3 text-xs text-trails-fg-dim">
            Want to color-code?{" "}
            <Link
              href="/categories"
              className="text-trails-accent underline hover:text-trails-accent-bright"
            >
              Create a category
            </Link>{" "}
            first.
          </p>
        )}
      </form>

      <section>
        <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
          Your Epics · {epics?.length ?? 0}
        </h2>
        {isLoading ? (
          <p className="text-sm text-trails-fg-dim">Loading...</p>
        ) : !epics?.length ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-trails-fg-dim">
            No epics yet. Create your first one above to seed your Skill Tree.
          </p>
        ) : (
          <ul className="divide-y divide-trails-trim/20 rounded-lg border">
            {epics.map((epic) => (
              <li
                key={epic.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {epic.category && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-trails-trim/30"
                        style={{ backgroundColor: epic.category.color }}
                        title={epic.category.name}
                      />
                    )}
                    <Link
                      href={`/epics/${epic.id}`}
                      className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-trails-fg hover:text-trails-accent"
                    >
                      <span className="truncate">{epic.title}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    </Link>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-trails-fg-dim">
                    {epic.category && (
                      <span>{epic.category.name}</span>
                    )}
                    <span
                      className={
                        "font-display uppercase tracking-widest " +
                        statusClass[epic.status]
                      }
                    >
                      {statusLabel[epic.status] ?? epic.status}
                    </span>
                    <span>
                      {epic.milestones.length}{" "}
                      {epic.milestones.length === 1
                        ? "milestone"
                        : "milestones"}
                    </span>
                    {epic.targetDate && (
                      <span title="Aspirational completion date">
                        → {epic.targetDate}
                      </span>
                    )}
                  </div>
                  <EpicMilestoneTree milestones={epic.milestones} />
                </div>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Delete "${epic.title}"? Its milestones, steps, resources, and prerequisites will be removed too.`,
                      )
                    ) {
                      deleteEpic.mutate({ id: epic.id });
                    }
                  }}
                  title="Delete this Epic and all its nested data"
                  className="rounded-md border px-2 py-1.5 text-trails-fg-dim hover:bg-trails-bg-glow hover:text-trails-bad"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

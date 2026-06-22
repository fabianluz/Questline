"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  Loader2,
  Sparkles,
  TriangleAlert,
  Wand2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

type Suggestion = {
  name: string;
  description: string | null;
  domain: string | null;
  milestoneIds: string[];
  milestoneTitles: string[];
  alreadyExists: boolean;
};

/**
 * "Create Skills with AI": pick an Epic, choose Milestones inside it, and the
 * local model proposes reusable Skills grounded in those milestones + their
 * steps. Review, then create + link in one click. 100% local.
 */
export function SkillAiCreate({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const toast = useToast();

  const [epicId, setEpicId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: epics } = trpc.epic.list.useQuery(undefined, { enabled: open });
  const { data: epic } = trpc.epic.byId.useQuery(
    { id: epicId },
    { enabled: open && epicId !== "" },
  );

  const milestones = useMemo(() => {
    if (!epic) return [];
    return [...epic.milestones].sort(
      (a, b) => a.tier - b.tier || a.position - b.position,
    );
  }, [epic]);

  const suggest = trpc.skill.aiSuggestForMilestones.useMutation({
    onSuccess: (res) => {
      setSuggestions(res.suggestions);
      setAccepted(new Set(res.suggestions.map((_, i) => i)));
    },
    onError: (e) => setError(e.message),
  });

  const apply = trpc.skill.applySuggestedSkills.useMutation({
    onSuccess: (r) => {
      utils.skill.list.invalidate();
      utils.tree.get.invalidate();
      if (epicId) utils.epic.byId.invalidate({ id: epicId });
      toast({
        title: "Skills created",
        description: `${r.created} new · ${r.reused} reused · ${r.linked} milestone link${r.linked === 1 ? "" : "s"}`,
        variant: "success",
      });
      reset();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  function reset() {
    setEpicId("");
    setSelected(new Set());
    setSuggestions(null);
    setAccepted(new Set());
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function toggleMilestone(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runSuggest() {
    setError(null);
    suggest.mutate({ milestoneIds: [...selected] });
  }

  function commit() {
    if (!suggestions) return;
    const chosen = suggestions.filter((_, i) => accepted.has(i));
    if (chosen.length === 0) return;
    apply.mutate({
      skills: chosen.map((s) => ({
        name: s.name,
        description: s.description,
        domain: s.domain,
        milestoneIds: s.milestoneIds,
      })),
    });
  }

  if (!open) return null;

  const reviewing = suggestions !== null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        className="jrpg-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Create skills with AI"
      >
        <header className="flex items-center justify-between border-b border-jrpg-gold/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-jrpg-gold" />
            <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
              Create Skills with AI
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="text-trails-fg-dim hover:text-trails-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <p className="mb-3 flex items-start gap-2 rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-xs text-trails-bad">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {!reviewing ? (
            <>
              <p className="mb-3 text-xs text-trails-fg-dim">
                Pick an Epic, choose the Milestones to draw from, and the local
                model will propose Skills based on their titles and Steps.
              </p>

              <label className="mb-1 block font-display text-[10px] uppercase tracking-widest text-trails-accent">
                Epic
              </label>
              <select
                value={epicId}
                onChange={(e) => {
                  setEpicId(e.target.value);
                  setSelected(new Set());
                }}
                className="mb-4 w-full rounded-md px-3 py-2 text-sm"
              >
                <option value="">Select an epic…</option>
                {epics?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>

              {epicId && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-display text-[10px] uppercase tracking-widest text-trails-accent">
                      Milestones · {selected.size} selected
                    </span>
                    {milestones.length > 0 && (
                      <button
                        onClick={() =>
                          setSelected(
                            selected.size === milestones.length
                              ? new Set()
                              : new Set(milestones.map((m) => m.id)),
                          )
                        }
                        className="text-[11px] text-trails-fg-dim hover:text-trails-accent"
                      >
                        {selected.size === milestones.length
                          ? "Clear all"
                          : "Select all"}
                      </button>
                    )}
                  </div>
                  {milestones.length === 0 ? (
                    <p className="text-xs text-trails-fg-dim">
                      This epic has no milestones yet.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {milestones.map((m) => {
                        const on = selected.has(m.id);
                        const linked = m.skills.map((ms) => ms.skill.name);
                        return (
                          <li key={m.id}>
                            <button
                              onClick={() => toggleMilestone(m.id)}
                              className={cn(
                                "flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                                on
                                  ? "border-trails-accent/60 bg-trails-accent/10"
                                  : "border-trails-trim/40 hover:border-trails-accent/40",
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                  on
                                    ? "border-trails-accent bg-trails-accent/30 text-trails-accent-bright"
                                    : "border-trails-trim/60",
                                )}
                              >
                                {on && <Check className="h-3 w-3" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-trails-fg">
                                    {m.title}
                                  </span>
                                  <span className="shrink-0 font-mono text-[9px] text-trails-fg-dim">
                                    T{m.tier}
                                  </span>
                                </span>
                                <span className="mt-0.5 block text-[11px] text-trails-fg-dim">
                                  {m.steps.length} step
                                  {m.steps.length === 1 ? "" : "s"}
                                  {linked.length > 0 &&
                                    ` · linked: ${linked.join(", ")}`}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-trails-fg-dim">
              The model didn&apos;t suggest any skills for those milestones. Go
              back and try a different selection, or run it again.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-trails-fg-dim">
                {accepted.size} of {suggestions.length} selected. Existing skills
                are reused (not duplicated); each links to the milestones shown.
              </p>
              <ul className="space-y-2">
                {suggestions.map((s, i) => {
                  const on = accepted.has(i);
                  return (
                    <li key={`${s.name}-${i}`}>
                      <button
                        onClick={() =>
                          setAccepted((a) => {
                            const next = new Set(a);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                          on
                            ? "border-trails-accent/60 bg-trails-accent/10"
                            : "border-trails-trim/40 opacity-60 hover:opacity-100",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            on
                              ? "border-trails-accent bg-trails-accent/30 text-trails-accent-bright"
                              : "border-trails-trim/60",
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-jrpg-gold" />
                            <span className="text-sm font-semibold text-trails-fg">
                              {s.name}
                            </span>
                            {s.domain && (
                              <span className="rounded-sm border border-trails-trim/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-trails-fg-dim">
                                {s.domain}
                              </span>
                            )}
                            {s.alreadyExists && (
                              <span className="rounded-sm border border-trails-info/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-trails-info">
                                reuse existing
                              </span>
                            )}
                          </span>
                          {s.description && (
                            <span className="mt-0.5 block text-xs text-trails-fg-dim">
                              {s.description}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-trails-fg-muted">
                            → links to: {s.milestoneTitles.join(", ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-jrpg-gold/40 px-4 py-3">
          {reviewing ? (
            <button
              onClick={() => {
                setSuggestions(null);
                setError(null);
              }}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
            >
              <ChevronLeft className="h-3 w-3" /> Back
            </button>
          ) : (
            <span className="text-[11px] text-trails-fg-dim">
              {selected.size > 0
                ? `${selected.size} milestone${selected.size === 1 ? "" : "s"} selected`
                : "Select at least one milestone"}
            </span>
          )}

          {!reviewing ? (
            <button
              onClick={runSuggest}
              disabled={selected.size === 0 || suggest.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-trails-accent bg-trails-accent/15 px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/25 disabled:opacity-50"
            >
              {suggest.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {suggest.isPending ? "Thinking…" : "Suggest skills"}
            </button>
          ) : (
            suggestions.length > 0 && (
              <button
                onClick={commit}
                disabled={accepted.size === 0 || apply.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {apply.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Create {accepted.size} skill{accepted.size === 1 ? "" : "s"}
              </button>
            )
          )}
        </footer>
      </div>
    </div>
  );
}

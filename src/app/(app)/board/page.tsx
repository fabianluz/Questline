"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Flame,
  GitBranch,
  HelpCircle,
  Link2,
  Maximize2,
  Minimize2,
  Mountain,
  Pencil,
  Plus,
  Sparkles,
  Square,
  StretchHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { JsonExportDialog } from "@/components/json-export-dialog";
import { JsonImportDialog } from "@/components/json-import-dialog";
import { BoardAiPlanModal } from "@/components/board-ai-plan-modal";
import type { ChapterBoardJson } from "@/lib/json-shapes";

/**
 * /board — JRPG-style chapter board.
 *
 * Horizontal columns of Chapters. Each chapter is subdivided into tier
 * rows (top → bottom): same tier = parallel work, higher tier = later
 * within the chapter. Cards inside tiers reference existing Epics,
 * Milestones, or Quests. The user can:
 *
 *   - Drag a card to a different chapter
 *   - Drag a card to a different tier within a chapter
 *   - Drag a card to reorder within a tier
 *   - Click +Card to add an existing entity to a chapter+tier
 *   - Click +Chapter to add a new chapter at the end
 *   - Edit chapter title / color / reorder chapter columns
 *   - Remove a card (entity stays — board node only)
 *
 * Drag-and-drop uses HTML5 native API (no extra deps). The drop targets
 * are tier rows; dropping inserts at the end of the tier. We expose
 * Up/Down arrows on each card to reorder inside a tier with the
 * keyboard for accessibility.
 */

type DragPayload = {
  kind: "node";
  nodeId: string;
  fromChapterId: string;
  fromTier: number;
};

type BoardNode = {
  id: string;
  chapterId: string;
  kind: "epic" | "milestone" | "quest";
  refId: string;
  tier: number;
  position: number;
  title: string;
  status: string | null;
  missing: boolean;
  startDate: string | null;
  deadline: string | null;
  stepsDone: number;
  stepsTotal: number;
  notes: string | null;
  extra: Record<string, unknown>;
};

/** Roman numeral for chapter headers (1→I, 4→IV, …). Falls back past 39. */
function roman(n: number): string {
  if (n < 1 || n > 39) return String(n);
  const map: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let v = n;
  for (const [val, sym] of map) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

/** Days until an ISO (YYYY-MM-DD) date; negative = past. null if no date. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

const NODE_ICONS = {
  epic: Mountain,
  milestone: Square,
  quest: Flame,
} as const;

const NODE_COLORS = {
  epic: "text-trails-info",
  milestone: "text-trails-good",
  quest: "text-trails-warn",
} as const;

/**
 * Distinct, dark-bg-friendly hues assigned per-epic so every card belonging
 * to the same Epic (its epic card + all its milestone cards, even across
 * chapters) shares one colour. This is what makes a multi-chapter epic
 * visually legible: e.g. "Relocate to the Netherlands" milestones glow the
 * same colour in Chapter 1 and Chapter 2.
 */
const EPIC_PALETTE = [
  "#6ea8fe",
  "#f7768e",
  "#9ece6a",
  "#e0af68",
  "#bb9af7",
  "#7dcfff",
  "#ff9e64",
  "#73daca",
  "#f7c8e0",
  "#c0caf5",
] as const;

export default function BoardPage() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.board.listBoard.useQuery();

  const createChapter = trpc.board.createChapter.useMutation({
    onSuccess: () => utils.board.listBoard.invalidate(),
  });
  const updateChapter = trpc.board.updateChapter.useMutation({
    onSuccess: () => utils.board.listBoard.invalidate(),
  });
  const reorderChapters = trpc.board.reorderChapters.useMutation({
    onSuccess: () => utils.board.listBoard.invalidate(),
  });
  const deleteChapter = trpc.board.deleteChapter.useMutation({
    onSuccess: () => utils.board.listBoard.invalidate(),
  });
  const moveNode = trpc.board.moveNode.useMutation({
    onSuccess: () => utils.board.listBoard.invalidate(),
  });
  const removeNode = trpc.board.removeNode.useMutation({
    onSuccess: () => {
      utils.board.listBoard.invalidate();
      utils.board.pickerOptions.invalidate();
    },
  });

  // Picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerChapter, setPickerChapter] = useState<{
    id: string;
    tier: number;
  } | null>(null);

  // Chapter inline-edit state
  const [editingChapter, setEditingChapter] = useState<string | null>(null);

  // AI Plan / Export / Import modal state
  const [aiOpen, setAiOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Lazy-load the export payload only when the dialog opens — keeps the
  // page-load query small for users who never open it.
  const exportQuery = trpc.board.exportBoard.useQuery(undefined, {
    enabled: exportOpen,
  });
  const importBoardMut = trpc.board.importBoard.useMutation();

  const chapters = data?.chapters ?? [];
  const nodes = data?.nodes ?? [];

  // Group nodes by chapter / tier so the render below is straightforward.
  const grouped = useMemo(() => {
    const map = new Map<string, Map<number, BoardNode[]>>();
    for (const n of nodes) {
      const t = map.get(n.chapterId) ?? new Map<number, BoardNode[]>();
      const arr = t.get(n.tier) ?? [];
      arr.push(n as BoardNode);
      t.set(n.tier, arr);
      map.set(n.chapterId, t);
    }
    return map;
  }, [nodes]);

  // Per-epic colour map + which epics span >1 chapter. Drives the coloured
  // accent on every card and the "spans N chapters" legend, so a big epic's
  // milestones read as one thread running through the journey.
  const epicMeta = useMemo(() => {
    const order: string[] = [];
    const titleById = new Map<string, string>();
    const chaptersByEpic = new Map<string, Set<string>>();
    for (const n of nodes) {
      const epicId = n.extra?.epicId as string | undefined;
      if (!epicId) continue;
      if (!titleById.has(epicId)) {
        titleById.set(epicId, (n.extra?.epicTitle as string) ?? "Epic");
        order.push(epicId);
      }
      const set = chaptersByEpic.get(epicId) ?? new Set<string>();
      set.add(n.chapterId);
      chaptersByEpic.set(epicId, set);
    }
    const colorById = new Map<string, string>();
    order.forEach((id, i) =>
      colorById.set(id, EPIC_PALETTE[i % EPIC_PALETTE.length]),
    );
    const spanning = new Map<string, number>();
    for (const [id, set] of chaptersByEpic) {
      if (set.size > 1) spanning.set(id, set.size);
    }
    return { colorById, titleById, spanning };
  }, [nodes]);

  // Per-chapter rollup for the headers: completion %, card count, deadline
  // span, and which chapter is "current" (the first not-yet-finished one).
  const { chapterStats, currentChapterId } = useMemo(() => {
    const stats = new Map<
      string,
      {
        total: number;
        completable: number;
        completed: number;
        minDeadline: string | null;
        maxDeadline: string | null;
      }
    >();
    for (const c of chapters) {
      stats.set(c.id, {
        total: 0,
        completable: 0,
        completed: 0,
        minDeadline: null,
        maxDeadline: null,
      });
    }
    for (const n of nodes) {
      const s = stats.get(n.chapterId);
      if (!s) continue;
      s.total += 1;
      // Epics + milestones have a real completion state; quests don't.
      if (n.kind === "epic" || n.kind === "milestone") {
        s.completable += 1;
        if (n.status === "completed") s.completed += 1;
      }
      if (n.deadline) {
        if (!s.minDeadline || n.deadline < s.minDeadline)
          s.minDeadline = n.deadline;
        if (!s.maxDeadline || n.deadline > s.maxDeadline)
          s.maxDeadline = n.deadline;
      }
    }
    // Current = first chapter (in order) that has completable work left.
    let current: string | null = null;
    for (const c of chapters) {
      const s = stats.get(c.id)!;
      if (s.completable > 0 && s.completed < s.completable) {
        current = c.id;
        break;
      }
    }
    return { chapterStats: stats, currentChapterId: current };
  }, [chapters, nodes]);

  // ── Epic-thread overlay plumbing ──────────────────────────────────
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentChapterRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  const registerCard = useCallback(
    (id: string, el: HTMLLIElement | null) => {
      if (el) cardRefs.current.set(id, el);
      else cardRefs.current.delete(id);
    },
    [],
  );
  const [showThreads, setShowThreads] = useState(false);
  const [compact, setCompact] = useState(false);
  const [fitAll, setFitAll] = useState(false);
  const [hoveredEpic, setHoveredEpic] = useState<string | null>(null);
  const router = useRouter();
  // Diablo-style hover detail: the node under the cursor + screen coords.
  const [hoverInfo, setHoverInfo] = useState<{
    node: BoardNode;
    x: number;
    y: number;
  } | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const bumpLayout = useCallback(() => setLayoutTick((t) => t + 1), []);

  // Recompute thread geometry on container/window resize.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => bumpLayout());
    ro.observe(el);
    window.addEventListener("resize", bumpLayout);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", bumpLayout);
    };
  }, [bumpLayout, chapters.length]);

  // Recompute threads whenever the board data changes (cards added/moved,
  // statuses/step-counts updated → card heights shift).
  useEffect(() => {
    bumpLayout();
  }, [data, bumpLayout]);

  // Translate vertical wheel scroll into horizontal board scroll, so a normal
  // mouse / trackpad can move across chapters without a horizontal gesture.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Let genuine horizontal intent (trackpad swipe) pass through.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ←/→ arrow keys page the board by roughly one chapter column. Ignored while
  // typing in a field or when an overlay/modal owns the keyboard, and a no-op in
  // Fit-all mode (nothing to scroll).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      )
        return;
      const el = scrollRef.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      // One "page" ≈ a comfortable column + gap; clamp to the viewport width.
      const step = Math.min(300, el.clientWidth * 0.8);
      el.scrollBy({
        left: e.key === "ArrowRight" ? step : -step,
        behavior: "smooth",
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Once data is loaded, bring the current chapter into view (it's usually
  // Chapter 1, but on a long board the user lands wherever they left off).
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current) return;
    if (isLoading || chapters.length === 0) return;
    const el = currentChapterRef.current;
    if (!el) return;
    didAutoScroll.current = true;
    el.scrollIntoView({ inline: "start", block: "nearest" });
  }, [isLoading, chapters.length]);

  function onDropToTier(
    e: React.DragEvent,
    toChapterId: string,
    toTier: number,
  ) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }
    if (payload.kind !== "node") return;
    // Default: drop at end of tier.
    const targetTier = grouped.get(toChapterId)?.get(toTier) ?? [];
    moveNode.mutate({
      id: payload.nodeId,
      toChapterId,
      toTier,
      toPosition: targetTier.length,
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-trails-accent" />
            Chapter board
            <span
              title="Plan the ORDER your life-goals get tackled in. Each Chapter is a phase (Chapter 1, Chapter 2, …); same-tier cards inside a chapter happen in parallel; higher tiers happen later within that chapter. Drag cards between chapters + tiers. The cards themselves point at your existing Epics, Milestones, and Quests — moving them here doesn't duplicate anything."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Drag cards between chapters and tiers. Use the arrows to
            reorder inside a tier without dragging.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCompact((v) => !v)}
            title="Toggle compact cards — fit more of your journey on screen"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-display text-xs uppercase tracking-widest",
              compact
                ? "border-trails-accent bg-trails-accent/15 text-trails-accent"
                : "border-trails-trim/60 bg-trails-panel-dark text-trails-fg-dim hover:text-trails-accent",
            )}
          >
            {compact ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            {compact ? "Comfortable" : "Compact"}
          </button>
          <button
            onClick={() => setFitAll((v) => !v)}
            title="Fit every chapter on screen (squeeze columns to the window) vs. fixed-width columns you scroll through"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-display text-xs uppercase tracking-widest",
              fitAll
                ? "border-trails-accent bg-trails-accent/15 text-trails-accent"
                : "border-trails-trim/60 bg-trails-panel-dark text-trails-fg-dim hover:text-trails-accent",
            )}
          >
            <StretchHorizontal className="h-3 w-3" />
            {fitAll ? "Scroll" : "Fit all"}
          </button>
          <button
            onClick={() => setShowThreads((v) => !v)}
            disabled={epicMeta.spanning.size === 0}
            title={
              epicMeta.spanning.size === 0
                ? "No epics span multiple chapters yet — nothing to thread"
                : "Toggle connector lines linking an epic's cards across chapters"
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-display text-xs uppercase tracking-widest disabled:opacity-40",
              showThreads
                ? "border-trails-accent bg-trails-accent/15 text-trails-accent"
                : "border-trails-trim/60 bg-trails-panel-dark text-trails-fg-dim hover:text-trails-accent",
            )}
          >
            <GitBranch className="h-3 w-3" />
            Threads
            {epicMeta.spanning.size > 0 && (
              <span className="ml-0.5 rounded-full bg-trails-accent/25 px-1 text-[10px]">
                {epicMeta.spanning.size}
              </span>
            )}
          </button>
          <button
            onClick={() => setAiOpen(true)}
            title="Let the local LLM propose a starter chapter layout from your Epics / Milestones / Quests"
            className="inline-flex items-center gap-1 rounded-md border border-trails-info bg-trails-info/15 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-info hover:bg-trails-info/25"
          >
            <Sparkles className="h-3 w-3" />
            AI Generate
          </button>
          <button
            onClick={() => setExportOpen(true)}
            title="Download the current chapter board as JSON"
            className="inline-flex items-center gap-1 rounded-md border border-trails-trim/60 bg-trails-panel-dark px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-fg-dim hover:text-trails-accent"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
          <button
            onClick={() => setImportOpen(true)}
            title="Replace or merge a chapter board from JSON"
            className="inline-flex items-center gap-1 rounded-md border border-trails-trim/60 bg-trails-panel-dark px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-fg-dim hover:text-trails-accent"
          >
            <Upload className="h-3 w-3" />
            Import
          </button>
          <button
            onClick={() => createChapter.mutate({ title: "New chapter" })}
            disabled={createChapter.isPending}
            className="inline-flex items-center gap-1 rounded-md border border-trails-accent bg-trails-accent/15 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-accent hover:bg-trails-accent/25 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            New chapter
          </button>
        </div>
      </header>

      {isLoading ? (
        <p className="text-sm text-trails-fg-dim">Loading…</p>
      ) : chapters.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-trails-fg-dim" />
          <p className="mt-3 font-display text-sm uppercase tracking-widest text-trails-accent">
            Your chapter board is empty
          </p>
          <p className="mt-2 text-sm text-trails-fg-dim">
            Create your first chapter — think{" "}
            <em>"Chapter 1: Pass the exams"</em> or{" "}
            <em>"Chapter 1: Get the basics down"</em>.
          </p>
          <button
            onClick={() => createChapter.mutate({ title: "Chapter 1" })}
            className="mt-4 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Plus className="h-3 w-3" />
            Create the first chapter
          </button>
        </div>
      ) : (
        <>
        {showThreads && epicMeta.spanning.size > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-trails-trim/30 bg-trails-bg-deep/40 px-3 py-2 text-[11px]">
            <span className="inline-flex items-center gap-1 font-display uppercase tracking-widest text-trails-fg-dim">
              <Link2 className="h-3 w-3" />
              Epics spanning chapters
            </span>
            {[...epicMeta.spanning.entries()].map(([epicId, count]) => (
              <span
                key={epicId}
                className="inline-flex items-center gap-1.5 text-trails-fg"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      epicMeta.colorById.get(epicId) ?? "#888",
                  }}
                />
                {epicMeta.titleById.get(epicId)}
                <span className="text-trails-fg-dim">· {count} ch.</span>
              </span>
            ))}
          </div>
        )}
        <div
          ref={scrollRef}
          className={cn(
            "relative flex gap-3 pb-3",
            fitAll ? "overflow-x-hidden" : "overflow-x-auto",
          )}
        >
          {chapters.map((chapter, chapterIdx) => {
            const chapterNodes = grouped.get(chapter.id) ?? new Map();
            const tiersWithNodes = [...chapterNodes.keys()].sort(
              (a, b) => a - b,
            );
            // Always render at least one empty tier so the user has a
            // drop target.
            const tiers =
              tiersWithNodes.length > 0 ? tiersWithNodes : [0];
            const stats = chapterStats.get(chapter.id);
            const isCurrent = chapter.id === currentChapterId;
            const isDone =
              !!stats &&
              stats.completable > 0 &&
              stats.completed === stats.completable;
            const pct =
              stats && stats.completable > 0
                ? Math.round((stats.completed / stats.completable) * 100)
                : null;
            return (
              <article
                key={chapter.id}
                ref={isCurrent ? currentChapterRef : undefined}
                className={cn(
                  "relative z-10 flex flex-col rounded-lg border transition-opacity",
                  fitAll
                    ? "min-w-0 flex-1 basis-0"
                    : cn("shrink-0", compact ? "w-56" : "w-72"),
                  isCurrent &&
                    "ring-2 ring-trails-accent/60 ring-offset-1 ring-offset-trails-bg-deep",
                  isDone && "opacity-70",
                )}
                style={
                  chapter.color
                    ? {
                        borderTopWidth: 4,
                        borderTopColor: chapter.color,
                      }
                    : undefined
                }
              >
                {/* Chapter header */}
                <header className="group relative border-b border-trails-trim/30 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 pr-16 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim">
                    <span>Chapter {roman(chapterIdx + 1)}</span>
                    {isCurrent && (
                      <span className="rounded-sm bg-trails-accent/20 px-1 text-trails-accent">
                        ◆ Current
                      </span>
                    )}
                    {isDone && (
                      <span className="inline-flex items-center gap-0.5 text-trails-good">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Done
                      </span>
                    )}
                  </div>
                  <div className="flex items-start">
                  {editingChapter === chapter.id ? (
                    <input
                      type="text"
                      defaultValue={chapter.title}
                      autoFocus
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== chapter.title) {
                          updateChapter.mutate({
                            id: chapter.id,
                            title: v,
                          });
                        }
                        setEditingChapter(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        } else if (e.key === "Escape") {
                          setEditingChapter(null);
                        }
                      }}
                      className="w-full rounded-md px-2 py-1 text-sm"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingChapter(chapter.id)}
                      title="Click to edit chapter title"
                      className="block w-full rounded-md px-2 py-1 text-left font-display text-sm uppercase leading-snug tracking-normal text-trails-accent hover:bg-trails-bg-glow"
                    >
                      {chapter.title}
                    </button>
                  )}
                  </div>
                  {/* Reorder / recolor / delete — revealed on hover so the
                      chapter title can use the full width and stay readable. */}
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-trails-trim/40 bg-trails-bg-deep/90 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    onClick={() => {
                      if (chapterIdx === 0) return;
                      const newOrder = chapters.map((c) => c.id);
                      [newOrder[chapterIdx - 1], newOrder[chapterIdx]] = [
                        newOrder[chapterIdx],
                        newOrder[chapterIdx - 1],
                      ];
                      reorderChapters.mutate({ ids: newOrder });
                    }}
                    disabled={chapterIdx === 0}
                    title="Move chapter left (earlier)"
                    className="rounded p-1 text-trails-fg-dim hover:text-trails-accent disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3 rotate-[-90deg]" />
                  </button>
                  <button
                    onClick={() => {
                      if (chapterIdx === chapters.length - 1) return;
                      const newOrder = chapters.map((c) => c.id);
                      [newOrder[chapterIdx + 1], newOrder[chapterIdx]] = [
                        newOrder[chapterIdx],
                        newOrder[chapterIdx + 1],
                      ];
                      reorderChapters.mutate({ ids: newOrder });
                    }}
                    disabled={chapterIdx === chapters.length - 1}
                    title="Move chapter right (later)"
                    className="rounded p-1 text-trails-fg-dim hover:text-trails-accent disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3 rotate-90" />
                  </button>
                  <button
                    onClick={() => {
                      const color = prompt(
                        "Chapter color (hex like #5b2a86, blank to clear):",
                        chapter.color ?? "",
                      );
                      if (color === null) return;
                      const ok = /^#[0-9a-fA-F]{6}$/.test(color);
                      updateChapter.mutate({
                        id: chapter.id,
                        color: ok ? color : null,
                      });
                    }}
                    title="Pick a banner color"
                    className="rounded p-1 text-trails-fg-dim hover:text-trails-accent"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${chapter.title}"? Its cards will be removed (your underlying Epics / Milestones / Quests stay intact).`,
                        )
                      ) {
                        deleteChapter.mutate({ id: chapter.id });
                      }
                    }}
                    title="Delete chapter"
                    className="rounded p-1 text-trails-fg-dim hover:text-trails-bad"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  </div>

                  {stats && stats.total > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {pct !== null && (
                        <div className="flex items-center gap-2">
                          <div
                            className="relative h-1.5 flex-1 overflow-hidden rounded-full border border-trails-trim/40 bg-trails-bg-deep/70"
                            title={`${stats.completed}/${stats.completable} milestones complete`}
                          >
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-trails-accent to-trails-accent-bright"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 font-mono text-[10px] tabular-nums text-trails-fg-dim">
                            {pct}%
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-trails-fg-dim">
                        <span>
                          {stats.total} card{stats.total === 1 ? "" : "s"}
                        </span>
                        {stats.minDeadline && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-2.5 w-2.5" />
                            {stats.minDeadline === stats.maxDeadline
                              ? stats.minDeadline
                              : `${stats.minDeadline} → ${stats.maxDeadline}`}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </header>

                {/* Tiers */}
                <div className="flex-1 space-y-2 p-2">
                  {tiers.map((tier) => {
                    const tierNodes = (chapterNodes.get(tier) ?? []).sort(
                      (a: BoardNode, b: BoardNode) =>
                        a.position - b.position,
                    );
                    return (
                      <div
                        key={tier}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => onDropToTier(e, chapter.id, tier)}
                        className={cn(
                          "rounded-md border border-dashed border-trails-trim/30",
                          compact ? "p-1" : "p-2",
                        )}
                      >
                        <div
                          className={cn(
                            "flex items-center justify-between text-[10px]",
                            compact ? "mb-0.5" : "mb-1",
                          )}
                        >
                          <span className="font-display uppercase tracking-widest text-trails-accent">
                            Tier {tier}
                            {tierNodes.length > 1 && !compact && (
                              <span className="ml-1 text-trails-info">
                                · ⇉ parallel
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => {
                              setPickerChapter({
                                id: chapter.id,
                                tier,
                              });
                              setPickerOpen(true);
                            }}
                            title="Add an existing Epic / Milestone / Quest to this tier"
                            className="inline-flex items-center gap-1 rounded-md border border-trails-trim/40 px-1.5 py-0 text-trails-fg-dim hover:text-trails-accent"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            Card
                          </button>
                        </div>

                        <ul className={compact ? "space-y-1" : "space-y-1.5"}>
                          {tierNodes.length === 0 && (
                            <li className="px-2 py-3 text-center text-[11px] italic text-trails-fg-dim">
                              Drop cards here
                            </li>
                          )}
                          {tierNodes.map((n: BoardNode, i: number) => (
                            <BoardCard
                              key={n.id}
                              node={n}
                              chapterId={chapter.id}
                              tier={tier}
                              indexInTier={i}
                              siblingsCount={tierNodes.length}
                              epicColor={
                                n.extra?.epicId
                                  ? epicMeta.colorById.get(
                                      n.extra.epicId as string,
                                    )
                                  : undefined
                              }
                              epicSpanCount={
                                n.extra?.epicId
                                  ? epicMeta.spanning.get(
                                      n.extra.epicId as string,
                                    )
                                  : undefined
                              }
                              registerRef={(el) => registerCard(n.id, el)}
                              compact={compact}
                              onOpen={() => {
                                if (n.missing) return;
                                const eid = n.extra?.epicId as
                                  | string
                                  | undefined;
                                if (n.kind === "epic")
                                  router.push(`/epics/${n.refId}`);
                                else if (n.kind === "milestone" && eid)
                                  router.push(`/epics/${eid}`);
                                else if (n.kind === "quest")
                                  router.push(`/quests`);
                              }}
                              onHoverEpic={setHoveredEpic}
                              onHoverInfo={setHoverInfo}
                              dimmed={
                                hoveredEpic !== null &&
                                hoveredEpic !==
                                  (n.extra?.epicId as string | undefined)
                              }
                              onMoveUp={() => {
                                if (i === 0) return;
                                moveNode.mutate({
                                  id: n.id,
                                  toChapterId: chapter.id,
                                  toTier: tier,
                                  toPosition: i - 1,
                                });
                              }}
                              onMoveDown={() => {
                                if (i === tierNodes.length - 1) return;
                                moveNode.mutate({
                                  id: n.id,
                                  toChapterId: chapter.id,
                                  toTier: tier,
                                  toPosition: i + 1,
                                });
                              }}
                              onChangeTier={(delta) => {
                                moveNode.mutate({
                                  id: n.id,
                                  toChapterId: chapter.id,
                                  toTier: Math.max(0, tier + delta),
                                  toPosition: 0,
                                });
                              }}
                              onRemove={() =>
                                removeNode.mutate({ id: n.id })
                              }
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}

                  {/* Empty slot to drop into a NEW tier inside this
                      chapter. Drop here = create tier above last tier. */}
                  {tiersWithNodes.length > 0 && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) =>
                        onDropToTier(
                          e,
                          chapter.id,
                          Math.max(...tiers) + 1,
                        )
                      }
                      className={cn(
                        "rounded-md border border-dashed border-trails-accent/30 px-2 text-center text-[10px] italic text-trails-fg-dim hover:border-trails-accent hover:text-trails-accent",
                        compact ? "py-1" : "py-2",
                      )}
                    >
                      {compact ? "+ tier" : "Drop to add a new tier"}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {/* Rendered LAST so its layout effect commits after every card ref
              is attached (commit order is by sibling order). */}
          <EpicThreads
            scrollRef={scrollRef}
            cardRefs={cardRefs}
            nodes={nodes}
            chapterOrder={chapters.map((c) => c.id)}
            colorById={epicMeta.colorById}
            spanning={epicMeta.spanning}
            show={showThreads}
            hoveredEpic={hoveredEpic}
            tick={layoutTick}
          />
        </div>
        </>
      )}

      {/* Diablo-style hover detail card */}
      {hoverInfo && (
        <BoardCardTooltip
          node={hoverInfo.node}
          x={hoverInfo.x}
          y={hoverInfo.y}
          epicColor={
            hoverInfo.node.extra?.epicId
              ? epicMeta.colorById.get(
                  hoverInfo.node.extra.epicId as string,
                )
              : undefined
          }
          epicSpanCount={
            hoverInfo.node.extra?.epicId
              ? epicMeta.spanning.get(
                  hoverInfo.node.extra.epicId as string,
                )
              : undefined
          }
          chapterTitle={
            chapters.find((c) => c.id === hoverInfo.node.chapterId)?.title ??
            null
          }
        />
      )}

      {/* Picker modal */}
      {pickerOpen && pickerChapter && (
        <PickerModal
          chapterId={pickerChapter.id}
          tier={pickerChapter.tier}
          onClose={() => {
            setPickerOpen(false);
            setPickerChapter(null);
          }}
        />
      )}

      {/* AI Plan modal */}
      <BoardAiPlanModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onCommitted={() => {
          setAiOpen(false);
          utils.board.listBoard.invalidate();
          utils.board.pickerOptions.invalidate();
        }}
      />

      {/* Export JSON */}
      <JsonExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Chapter board"
        filename="questline-chapter-board.json"
        data={exportQuery.data ?? { loading: true }}
      />

      {/* Import JSON */}
      <JsonImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        shape="chapterBoard"
        title="Chapter board"
        modeSelect
        onSubmit={async (parsed, mode) => {
          try {
            // The dialog already validated `parsed` against the chapterBoard
            // schema before calling onSubmit, so this cast is sound.
            const report = await importBoardMut.mutateAsync({
              json: parsed as ChapterBoardJson,
              mode,
            });
            utils.board.listBoard.invalidate();
            utils.board.pickerOptions.invalidate();
            const skippedNote =
              report.skipped.length > 0
                ? ` · skipped ${report.skipped.length} unresolved ref${report.skipped.length === 1 ? "" : "s"}`
                : "";
            console.info(
              `Imported ${report.chaptersCreated} chapter(s), ${report.nodesCreated} card(s)${skippedNote}`,
            );
            return { ok: true } as const;
          } catch (err) {
            return {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            } as const;
          }
        }}
      />
    </div>
  );
}

function BoardCard({
  node,
  chapterId,
  tier,
  indexInTier,
  siblingsCount,
  epicColor,
  epicSpanCount,
  registerRef,
  compact,
  onOpen,
  onHoverEpic,
  onHoverInfo,
  dimmed,
  onMoveUp,
  onMoveDown,
  onChangeTier,
  onRemove,
}: {
  node: BoardNode;
  chapterId: string;
  tier: number;
  indexInTier: number;
  siblingsCount: number;
  /** Per-epic accent colour (shared by every card of the same epic). */
  epicColor?: string;
  /** If this card's epic spans >1 chapter, how many chapters it touches. */
  epicSpanCount?: number;
  /** Register the DOM node so the thread overlay can measure it. */
  registerRef?: (el: HTMLLIElement | null) => void;
  /** Compact density — render a slim one-line card. */
  compact?: boolean;
  /** Open the card's underlying entity (Epic / Milestone's epic / Quests). */
  onOpen?: () => void;
  /** Hover bubbles the epicId up so its thread can be focused. */
  onHoverEpic?: (epicId: string | null) => void;
  /** Hover bubbles the node + cursor coords up for the detail tooltip. */
  onHoverInfo?: (
    info: { node: BoardNode; x: number; y: number } | null,
  ) => void;
  /** Faded because another epic is currently focused. */
  dimmed?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeTier: (delta: number) => void;
  onRemove: () => void;
}) {
  const Icon = NODE_ICONS[node.kind];
  const iconColor = NODE_COLORS[node.kind];
  const epicTitle = node.extra?.epicTitle as string | undefined;
  const epicId = (node.extra?.epicId as string | undefined) ?? null;
  const done = node.status === "completed";
  const inProgress = node.status === "in_progress";
  const dLeft = daysUntil(node.deadline);
  return (
    <li
      ref={registerRef}
      draggable
      onDragStart={(e) => {
        const payload: DragPayload = {
          kind: "node",
          nodeId: node.id,
          fromChapterId: chapterId,
          fromTier: tier,
        };
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify(payload),
        );
        e.dataTransfer.effectAllowed = "move";
      }}
      onMouseEnter={(e) => {
        onHoverEpic?.(epicId);
        onHoverInfo?.({ node, x: e.clientX, y: e.clientY });
      }}
      onMouseMove={(e) => onHoverInfo?.({ node, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => {
        onHoverEpic?.(null);
        onHoverInfo?.(null);
      }}
      onClick={(e) => {
        // Let the X / reorder buttons handle their own clicks.
        if ((e.target as HTMLElement).closest("button")) return;
        onHoverInfo?.(null);
        onOpen?.();
      }}
      title={node.missing ? "Underlying entity was deleted" : undefined}
      className={cn(
        "group cursor-grab rounded-md border bg-trails-bg-deep/60 transition-all active:cursor-grabbing",
        compact ? "p-1.5" : "p-2",
        node.missing && "opacity-50",
        done && "bg-trails-good/5",
        inProgress && "ring-1 ring-trails-info/40",
        dimmed && "opacity-35",
      )}
      style={
        epicColor && !node.missing
          ? { borderLeftColor: epicColor, borderLeftWidth: 3 }
          : undefined
      }
    >
      {compact ? (
        <div className="flex items-center gap-1.5">
          {done ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-trails-good" />
          ) : (
            <Icon className={cn("h-3 w-3 shrink-0", iconColor)} />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[11px] font-medium text-trails-fg",
              (node.missing || done) && "line-through",
              done && "text-trails-fg-dim",
            )}
          >
            {node.title}
          </span>
          {epicSpanCount && epicSpanCount > 1 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] text-trails-info">
              <Link2 className="h-2.5 w-2.5" />
              {epicSpanCount}
            </span>
          )}
          {node.deadline && (
            <span
              title={`Deadline ${node.deadline}`}
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                dLeft !== null && dLeft < 0
                  ? "bg-trails-bad"
                  : dLeft !== null && dLeft <= 14
                    ? "bg-trails-warn"
                    : "bg-trails-trim",
              )}
            />
          )}
          <button
            onClick={onRemove}
            title="Remove from board (entity unaffected)"
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="h-3 w-3 text-trails-fg-dim hover:text-trails-bad" />
          </button>
        </div>
      ) : (
      <>
      <div className="flex items-start gap-1.5">
        {done ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-trails-good" />
        ) : (
          <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", iconColor)} />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-xs font-medium text-trails-fg",
              (node.missing || done) && "line-through",
              done && "text-trails-fg-dim",
            )}
          >
            {node.title}
          </p>
          <p className="flex items-center gap-1 truncate text-[10px] text-trails-fg-dim">
            {epicColor && !node.missing && (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: epicColor }}
                title={epicTitle ? `Part of: ${epicTitle}` : undefined}
              />
            )}
            <span className="truncate">
              {epicTitle ??
                (node.extra?.categoryName as string) ??
                node.kind}
            </span>
            {epicSpanCount && epicSpanCount > 1 && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-trails-info"
                title={`This epic spans ${epicSpanCount} chapters`}
              >
                <Link2 className="h-2.5 w-2.5" />
                {epicSpanCount}
              </span>
            )}
          </p>
          {/* Chips row: deadline + step progress */}
          {(node.deadline || node.stepsTotal > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {node.deadline && (
                <span
                  title={`Deadline ${node.deadline}`}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full border px-1 py-0 text-[9px] font-medium",
                    dLeft !== null && dLeft < 0
                      ? "border-trails-bad/50 bg-trails-bad/10 text-trails-bad"
                      : dLeft !== null && dLeft <= 14
                        ? "border-trails-warn/50 bg-trails-warn/10 text-trails-warn"
                        : "border-trails-trim/40 text-trails-fg-dim",
                  )}
                >
                  <CalendarClock className="h-2.5 w-2.5" />
                  {dLeft !== null && dLeft < 0
                    ? `${-dLeft}d over`
                    : dLeft !== null && dLeft === 0
                      ? "today"
                      : dLeft !== null && dLeft <= 14
                        ? `${dLeft}d`
                        : node.deadline}
                </span>
              )}
              {node.stepsTotal > 0 && (
                <span
                  className="inline-flex items-center gap-1"
                  title={`${node.stepsDone} of ${node.stepsTotal} steps done`}
                >
                  <span className="relative h-1 w-10 overflow-hidden rounded-full border border-trails-trim/40 bg-trails-bg-deep/70">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-trails-good"
                      style={{
                        width: `${Math.round((node.stepsDone / node.stepsTotal) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="font-mono text-[9px] text-trails-fg-dim">
                    {node.stepsDone}/{node.stepsTotal}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          title="Remove from board (entity unaffected)"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="h-3 w-3 text-trails-fg-dim hover:text-trails-bad" />
        </button>
      </div>
      {/* Quick reorder buttons (accessible keyboard alt to drag-drop) */}
      <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onMoveUp}
          disabled={indexInTier === 0}
          title="Move up within this tier"
          className="rounded p-0.5 text-trails-fg-dim hover:text-trails-accent disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={indexInTier === siblingsCount - 1}
          title="Move down within this tier"
          className="rounded p-0.5 text-trails-fg-dim hover:text-trails-accent disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          onClick={() => onChangeTier(-1)}
          disabled={tier === 0}
          title="Bump to a higher (earlier) tier"
          className="rounded p-0.5 text-trails-fg-dim hover:text-trails-accent disabled:opacity-30"
        >
          ↑t
        </button>
        <button
          onClick={() => onChangeTier(+1)}
          title="Bump to a lower (later) tier"
          className="rounded p-0.5 text-trails-fg-dim hover:text-trails-accent"
        >
          ↓t
        </button>
      </div>
      </>
      )}
    </li>
  );
}

/** One label/value line inside the hover detail card. */
function TipRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[11px] text-trails-fg">
        {children}
      </span>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  paused: "Paused",
  abandoned: "Abandoned",
  active: "Active",
  archived: "Archived",
};

/**
 * Diablo-style hover detail card. Fixed to the viewport near the cursor,
 * flipping left / up when it would overflow. Pointer-events-none so it never
 * steals the hover from the card underneath.
 */
function BoardCardTooltip({
  node,
  x,
  y,
  epicColor,
  epicSpanCount,
  chapterTitle,
}: {
  node: BoardNode;
  x: number;
  y: number;
  epicColor?: string;
  epicSpanCount?: number;
  chapterTitle: string | null;
}) {
  const Icon = NODE_ICONS[node.kind];
  const epicTitle = node.extra?.epicTitle as string | undefined;
  const categoryName = node.extra?.categoryName as string | undefined;
  const description = node.extra?.description as string | undefined;
  const cadence = node.extra?.cadence as string | undefined;
  const xpReward = node.extra?.xpReward as number | undefined;
  const difficulty = node.extra?.difficulty as string | undefined;
  const dStart = daysUntil(node.startDate);
  const dLeft = daysUntil(node.deadline);

  const W = 288;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = x + W + 24 > vw ? Math.max(8, x - W - 16) : x + 16;
  const top = Math.min(Math.max(8, y + 16), vh - 260);

  function fmtDate(iso: string | null, rel: number | null): string | null {
    if (!iso) return null;
    if (rel === null) return iso;
    const tag =
      rel < 0
        ? `${-rel}d ago`
        : rel === 0
          ? "today"
          : `in ${rel}d`;
    return `${iso} · ${tag}`;
  }

  return (
    <div
      className="pointer-events-none fixed z-50 w-72 rounded-lg border-2 border-trails-accent/70 bg-trails-bg-deep/95 p-3 shadow-2xl backdrop-blur-sm"
      style={{
        left,
        top,
        ...(epicColor ? { borderLeftColor: epicColor, borderLeftWidth: 4 } : {}),
      }}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn("mt-0.5 h-4 w-4 shrink-0", NODE_COLORS[node.kind])}
        />
        <div className="min-w-0">
          <p className="font-display text-sm leading-tight text-trails-accent">
            {node.title}
          </p>
          <p className="mt-0.5 font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
            {node.kind}
            {chapterTitle ? ` · ${chapterTitle}` : ""}
          </p>
        </div>
      </div>

      {description && (
        <p className="mt-2 line-clamp-3 text-[11px] leading-snug text-trails-fg-dim">
          {description}
        </p>
      )}

      <div className="mt-2 space-y-1 border-t border-trails-trim/30 pt-2">
        {node.status && (
          <TipRow label="Status">
            {STATUS_LABELS[node.status] ?? node.status}
          </TipRow>
        )}
        {epicTitle && node.kind !== "epic" && (
          <TipRow label="Epic">
            <span className="inline-flex items-center gap-1.5">
              {epicColor && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: epicColor }}
                />
              )}
              {epicTitle}
            </span>
          </TipRow>
        )}
        {categoryName && <TipRow label="Area">{categoryName}</TipRow>}
        {fmtDate(node.startDate, dStart) && (
          <TipRow label="Starts">{fmtDate(node.startDate, dStart)}</TipRow>
        )}
        {fmtDate(node.deadline, dLeft) && (
          <TipRow label="Target">
            <span
              className={cn(
                dLeft !== null && dLeft < 0
                  ? "text-trails-bad"
                  : dLeft !== null && dLeft <= 14
                    ? "text-trails-warn"
                    : undefined,
              )}
            >
              {fmtDate(node.deadline, dLeft)}
            </span>
          </TipRow>
        )}
        {node.stepsTotal > 0 && (
          <TipRow label="Steps">
            {node.stepsDone}/{node.stepsTotal} done (
            {Math.round((node.stepsDone / node.stepsTotal) * 100)}%)
          </TipRow>
        )}
        {cadence && (
          <TipRow label="Cadence">
            {cadence}
            {typeof xpReward === "number" ? ` · +${xpReward} XP` : ""}
            {difficulty ? ` · ${difficulty}` : ""}
          </TipRow>
        )}
        {epicSpanCount && epicSpanCount > 1 && (
          <TipRow label="Spans">{epicSpanCount} chapters</TipRow>
        )}
      </div>

      {node.missing ? (
        <p className="mt-2 text-[10px] text-trails-bad">
          Underlying entity was deleted.
        </p>
      ) : (
        <p className="mt-2 text-[9px] italic text-trails-fg-dim">
          Click to open · drag to move · ✕ removes from board
        </p>
      )}
    </div>
  );
}

function PickerModal({
  chapterId,
  tier,
  onClose,
}: {
  chapterId: string;
  tier: number;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.board.pickerOptions.useQuery();
  const addNode = trpc.board.addNode.useMutation({
    onSuccess: () => {
      utils.board.listBoard.invalidate();
      utils.board.pickerOptions.invalidate();
    },
  });

  const [tab, setTab] = useState<"epic" | "milestone" | "quest">("epic");

  const Icon = NODE_ICONS[tab];
  const iconColor = NODE_COLORS[tab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="jrpg-panel relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
          <h2 className="font-display text-lg uppercase tracking-widest text-jrpg-gold-bright">
            + Add a card
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-jrpg-gold/30 px-4 py-2">
          <div className="inline-flex rounded-md border border-trails-trim/40 p-0.5">
            {(["epic", "milestone", "quest"] as const).map((k) => {
              const KIcon = NODE_ICONS[k];
              const kColor = NODE_COLORS[k];
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-3 py-1 font-display text-[11px] uppercase tracking-widest transition",
                    tab === k
                      ? "bg-trails-accent/15 text-trails-accent-bright"
                      : "text-trails-fg-dim hover:text-trails-accent",
                  )}
                >
                  <KIcon className={cn("h-3 w-3", kColor)} />
                  {k}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-trails-fg-dim">
            Picking one places it at the end of Tier {tier} of this
            chapter. Items already on the board can be added again — a big
            epic can live in several chapters.
          </p>
        </div>

        <div className="overflow-y-auto p-3">
          {isLoading ? (
            <p className="text-xs text-trails-fg-dim">Loading…</p>
          ) : (
            <ul className="space-y-1">
              {tab === "epic" &&
                (data?.epics ?? []).map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => {
                        addNode.mutate({
                          chapterId,
                          kind: "epic",
                          refId: e.id,
                          tier,
                        });
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded-md border border-trails-trim/40 px-2 py-1.5 text-left text-xs hover:bg-trails-accent/10"
                    >
                      <Icon className={cn("h-3 w-3", iconColor)} />
                      <span className="flex-1 truncate text-trails-fg">
                        {e.title}
                      </span>
                      <OnBoardBadge count={e.placedCount} />
                      <span className="font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
                        {e.status.replace("_", " ")}
                      </span>
                    </button>
                  </li>
                ))}
              {tab === "milestone" &&
                (data?.milestones ?? []).map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        addNode.mutate({
                          chapterId,
                          kind: "milestone",
                          refId: m.id,
                          tier,
                        });
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded-md border border-trails-trim/40 px-2 py-1.5 text-left text-xs hover:bg-trails-accent/10"
                    >
                      <Square className="h-3 w-3 text-trails-good" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-trails-fg">{m.title}</p>
                        <p className="truncate text-[10px] text-trails-fg-dim">
                          {m.epicTitle}
                        </p>
                      </div>
                      <OnBoardBadge count={m.placedCount} />
                    </button>
                  </li>
                ))}
              {tab === "quest" &&
                (data?.quests ?? []).map((q) => (
                  <li key={q.id}>
                    <button
                      onClick={() => {
                        addNode.mutate({
                          chapterId,
                          kind: "quest",
                          refId: q.id,
                          tier,
                        });
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded-md border border-trails-trim/40 px-2 py-1.5 text-left text-xs hover:bg-trails-accent/10"
                    >
                      <Flame className="h-3 w-3 text-trails-warn" />
                      <span className="flex-1 truncate text-trails-fg">
                        {q.title}
                      </span>
                      <OnBoardBadge count={q.placedCount} />
                      <span className="font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
                        {q.cadence}
                      </span>
                    </button>
                  </li>
                ))}
              {tab === "epic" && (data?.epics.length ?? 0) === 0 && (
                <Empty type="epic" />
              )}
              {tab === "milestone" &&
                (data?.milestones.length ?? 0) === 0 && (
                  <Empty type="milestone" />
                )}
              {tab === "quest" && (data?.quests.length ?? 0) === 0 && (
                <Empty type="quest" />
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small "already on the board" pill shown in the picker for repeat-adds. */
function OnBoardBadge({ count }: { count: number }) {
  if (!count || count < 1) return null;
  return (
    <span
      title={`Already on the board ${count} time${count === 1 ? "" : "s"} — adding again places another copy`}
      className="shrink-0 rounded-sm border border-trails-info/40 bg-trails-info/10 px-1 py-0 font-display text-[8px] uppercase tracking-widest text-trails-info"
    >
      on board{count > 1 ? ` ×${count}` : ""}
    </span>
  );
}

function Empty({ type }: { type: "epic" | "milestone" | "quest" }) {
  return (
    <li className="rounded-md border border-dashed p-6 text-center">
      <p className="text-xs text-trails-fg-dim">
        You don't have any {type}s yet.
      </p>
      <p className="mt-1 text-[10px] italic text-trails-fg-dim">
        Create some on{" "}
        <code className="font-mono">
          {type === "epic"
            ? "/epics"
            : type === "milestone"
              ? "an Epic detail page"
              : "/quests"}
        </code>{" "}
        first.
      </p>
    </li>
  );
}

// ───────────────────────────────────────────────────────────────────
// Epic threads — the SVG overlay that draws a coloured connector for each
// epic whose milestones span more than one chapter, in journey order.
// ───────────────────────────────────────────────────────────────────

type ThreadSegment = {
  key: string;
  d: string;
  color: string;
  dashed: boolean;
  epicId: string;
};
type ThreadDot = { key: string; x: number; y: number; color: string; epicId: string };

function EpicThreads({
  scrollRef,
  cardRefs,
  nodes,
  chapterOrder,
  colorById,
  spanning,
  show,
  hoveredEpic,
  tick,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  cardRefs: React.RefObject<Map<string, HTMLLIElement>>;
  nodes: BoardNode[];
  chapterOrder: string[];
  colorById: Map<string, string>;
  spanning: Map<string, number>;
  show: boolean;
  hoveredEpic: string | null;
  tick: number;
}) {
  const [segments, setSegments] = useState<ThreadSegment[]>([]);
  const [dots, setDots] = useState<ThreadDot[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // A signature so we recompute when the node layout (not just object refs)
  // changes — ids/chapters/tiers/positions/statuses all affect geometry.
  const sig = nodes
    .map((n) => `${n.id}:${n.chapterId}:${n.tier}:${n.position}:${n.status}`)
    .join("|");

  useLayoutEffect(() => {
    if (!show) {
      setSegments([]);
      setDots([]);
      return;
    }
    // Defer the measurement one macrotask. Card refs are (re)attached during
    // commit and we must read their final laid-out positions. We use setTimeout
    // (not requestAnimationFrame — rAF is throttled/paused when the window is
    // backgrounded) so every card ref is in place before we measure; otherwise
    // `refs` is empty and we draw nothing.
    const timer = setTimeout(() => {
    const container = scrollRef.current;
    const refs = cardRefs.current;
    if (!container || !refs) {
      setSegments([]);
      setDots([]);
      return;
    }
    const crect = container.getBoundingClientRect();
    const toLocal = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const left = r.left - crect.left + container.scrollLeft;
      const top = r.top - crect.top + container.scrollTop;
      return {
        left,
        top,
        right: left + r.width,
        bottom: top + r.height,
        cx: left + r.width / 2,
        cy: top + r.height / 2,
      };
    };

    // Size the SVG to the full content extent of all measured cards.
    let maxRight = 0;
    let maxBottom = 0;
    for (const el of refs.values()) {
      const p = toLocal(el);
      if (p.right > maxRight) maxRight = p.right;
      if (p.bottom > maxBottom) maxBottom = p.bottom;
    }

    const chapIdx = new Map(chapterOrder.map((id, i) => [id, i]));
    const segs: ThreadSegment[] = [];
    const dotList: ThreadDot[] = [];

    for (const epicId of spanning.keys()) {
      const color = colorById.get(epicId) ?? "#888";
      const epicNodes = nodes
        .filter((n) => (n.extra?.epicId as string | undefined) === epicId)
        .sort((a, b) => {
          const ca = chapIdx.get(a.chapterId) ?? 0;
          const cb = chapIdx.get(b.chapterId) ?? 0;
          return ca - cb || a.tier - b.tier || a.position - b.position;
        });

      const pts = epicNodes
        .map((n) => {
          const el = refs.get(n.id);
          if (!el) return null;
          return { ...toLocal(el), chapterId: n.chapterId, done: n.status === "completed" };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      for (let i = 0; i < pts.length; i++) {
        dotList.push({
          key: `${epicId}-dot-${i}`,
          // anchor dots on the side the line attaches to
          x: i === 0 ? pts[i].right : pts[i].left,
          y: pts[i].cy,
          color,
          epicId,
        });
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        let d: string;
        if (a.chapterId === b.chapterId) {
          // same column → vertical-ish link (bottom → top)
          const x1 = a.cx;
          const y1 = a.bottom;
          const x2 = b.cx;
          const y2 = b.top;
          const dy = Math.max(12, (y2 - y1) * 0.4);
          d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
        } else {
          // across columns → horizontal link (right → left)
          const x1 = a.right;
          const y1 = a.cy;
          const x2 = b.left;
          const y2 = b.cy;
          const dx = Math.max(24, (x2 - x1) * 0.5);
          d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        }
        segs.push({
          key: `${epicId}-seg-${i}`,
          d,
          color,
          dashed: !a.done,
          epicId,
        });
      }
    }

    setSegments(segs);
    setDots(dotList);
    setSize({ w: maxRight, h: maxBottom });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, show, tick, chapterOrder.join(","), spanning.size]);

  if (!show || segments.length === 0) return null;

  return (
    <svg
      width={size.w}
      height={size.h}
      className="pointer-events-none absolute left-0 top-0 z-20"
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {segments.map((s) => {
        const faded = hoveredEpic !== null && hoveredEpic !== s.epicId;
        return (
          <g key={s.key}>
            {/* soft glow underlay so threads read over busy cards */}
            <path
              d={s.d}
              fill="none"
              stroke={s.color}
              strokeWidth={faded ? 4 : 8}
              strokeLinecap="round"
              opacity={faded ? 0.04 : 0.18}
            />
            <path
              d={s.d}
              fill="none"
              stroke={s.color}
              strokeWidth={faded ? 1.5 : 3}
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "6 4" : undefined}
              opacity={faded ? 0.18 : 0.95}
            />
          </g>
        );
      })}
      {dots.map((dot) => {
        const faded = hoveredEpic !== null && hoveredEpic !== dot.epicId;
        return (
          <circle
            key={dot.key}
            cx={dot.x}
            cy={dot.y}
            r={faded ? 2 : 3.5}
            fill={dot.color}
            stroke="var(--trails-bg-deep, #0b1020)"
            strokeWidth={1}
            opacity={faded ? 0.2 : 1}
          />
        );
      })}
    </svg>
  );
}

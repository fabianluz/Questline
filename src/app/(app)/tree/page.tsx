"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeftRight,
  ArrowUpDown,
  CheckCircle2,
  Circle,
  HelpCircle,
  Layers,
  Lock,
  Maximize2,
  Package,
  Pause,
  Search,
  Sparkles,
  TreePine,
  X,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  buildTreeLayout,
  isGroupNodeId,
  isSubNodeId,
  type LayoutOpts,
} from "@/lib/tree-layout";
import { MilestoneNode } from "@/components/tree/milestone-node";
import { StepNode } from "@/components/tree/step-node";
import { ResourceNode } from "@/components/tree/resource-node";
import { EpicGroupNode } from "@/components/tree/epic-group-node";
import { usePersistentState } from "@/lib/use-persistent-state";

const nodeTypes = {
  milestone: MilestoneNode,
  step: StepNode,
  resource: ResourceNode,
  epicGroup: EpicGroupNode,
};

type TreeData = inferRouterOutputs<AppRouter>["tree"]["get"];

/** Prune the tree to the active epic / category / status filters. */
function filterTree(
  data: TreeData,
  f: { epicId: string; categoryId: string; hideCompleted: boolean },
): TreeData {
  const keptEpics = data.epics.filter(
    (e) =>
      (f.epicId === "all" || e.id === f.epicId) &&
      (f.categoryId === "all" || e.category?.id === f.categoryId),
  );
  const keptEpicIds = new Set(keptEpics.map((e) => e.id));
  const keptMs = data.milestones.filter(
    (m) =>
      keptEpicIds.has(m.epicId) &&
      (!f.hideCompleted || m.status !== "completed"),
  );
  const keptMsIds = new Set(keptMs.map((m) => m.id));
  return {
    epics: keptEpics,
    milestones: keptMs,
    prerequisites: data.prerequisites.filter((p) => keptMsIds.has(p.milestoneId)),
    prereqSteps: data.prereqSteps.filter((s) => keptMsIds.has(s.parentMilestoneId)),
    prereqResources: data.prereqResources.filter((r) =>
      keptMsIds.has(r.parentMilestoneId),
    ),
  };
}

function TreeInner() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const rf = useReactFlow();
  const { data, isLoading } = trpc.tree.get.useQuery();

  const connect = trpc.prerequisite.connect.useMutation({
    onSuccess: () => utils.tree.get.invalidate(),
  });
  const disconnect = trpc.prerequisite.disconnect.useMutation({
    onSuccess: () => utils.tree.get.invalidate(),
  });

  // Toolbar state — filters/layout persist across visits via localStorage.
  const [epicId, setEpicId] = usePersistentState("tree.epicId", "all");
  const [categoryId, setCategoryId] = usePersistentState("tree.categoryId", "all");
  const [hideCompleted, setHideCompleted] = usePersistentState(
    "tree.hideCompleted",
    false,
  );
  const [search, setSearch] = useState("");
  const [rankdir, setRankdir] = usePersistentState<LayoutOpts["rankdir"]>(
    "tree.rankdir",
    "LR",
  );
  const [showSub, setShowSub] = usePersistentState("tree.showSub", false);
  const [legendOpen, setLegendOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.epics ?? [])
      if (e.category) m.set(e.category.id, e.category.name);
    return [...m.entries()];
  }, [data]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] };
    const filtered = filterTree(data, { epicId, categoryId, hideCompleted });
    const built = buildTreeLayout(filtered, { showSubNodes: showSub, rankdir });
    const q = search.trim().toLowerCase();
    if (!q) return built;
    const nodesDim = built.nodes.map((n) => {
      if (isGroupNodeId(n.id)) return n;
      const hay = `${(n.data as { title?: string }).title ?? ""} ${(n.data as { epicTitle?: string }).epicTitle ?? ""}`.toLowerCase();
      return { ...n, style: { ...n.style, opacity: hay.includes(q) ? 1 : 0.18 } };
    });
    return { nodes: nodesDim, edges: built.edges };
  }, [data, epicId, categoryId, hideCompleted, showSub, rankdir, search]);

  // Zoom to search matches.
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const hits = nodes.filter(
      (n) =>
        !isGroupNodeId(n.id) &&
        `${(n.data as { title?: string }).title ?? ""}`.toLowerCase().includes(q),
    );
    if (hits.length > 0) {
      rf.fitView({ nodes: hits.map((n) => ({ id: n.id })), duration: 400, maxZoom: 1.3, padding: 0.3 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Re-fit when the layout shape changes or the container resizes.
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ duration: 250 }), 60);
    return () => clearTimeout(t);
  }, [rankdir, showSub, epicId, categoryId, hideCompleted, rf]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => rf.fitView({ duration: 0 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rf]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      if ([c.source, c.target].some((id) => isSubNodeId(id) || isGroupNodeId(id)))
        return;
      connect.mutate({ milestoneId: c.target, requiredMilestoneId: c.source });
    },
    [connect],
  );
  const onEdgesDelete = useCallback(
    (eds: Edge[]) => {
      // Progression edges (id starts with "progress-") are suggestions with no
      // DB row — ignore those; only real prerequisites can be deleted.
      eds
        .filter((e) => !e.id.startsWith("progress-"))
        .forEach((e) => disconnect.mutate({ id: e.id }));
    },
    [disconnect],
  );

  if (isLoading)
    return <p className="text-sm text-trails-fg-dim">Loading skill tree…</p>;

  if (!data || data.milestones.length === 0)
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-trails-accent" /> Skill Tree
        </h1>
        <div className="rounded-lg border border-dashed p-12 text-center">
          <TreePine className="mx-auto h-8 w-8 text-trails-fg-dim" />
          <p className="mt-3 text-sm text-trails-fg-dim">
            Create an Epic and add Milestones to see your tree come alive.
          </p>
          <Link
            href="/epics"
            className="mt-4 inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Go to Epics →
          </Link>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      <header>
        <h1 className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-trails-accent" /> Skill Tree
        </h1>
        <p className="mt-1 text-sm text-trails-fg-dim">
          Drag a milestone&apos;s right edge onto another to link them. Hover a
          node for details. Double-click to open its Epic.
        </p>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
        <Select value={epicId} onChange={setEpicId} label="Epic">
          <option value="all">All epics</option>
          {data.epics.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </Select>
        {categories.length > 0 && (
          <Select value={categoryId} onChange={setCategoryId} label="Category">
            <option value="all">All categories</option>
            {categories.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </Select>
        )}
        <label className="inline-flex items-center gap-1 text-trails-fg-dim">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => setHideCompleted(e.target.checked)}
          />
          Hide completed
        </label>

        <div className="relative">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-trails-fg-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-36 rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 py-1 pl-6 pr-2 text-xs text-trails-fg focus:outline-none focus:ring-1 focus:ring-trails-accent/40"
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Toggle on={showSub} onClick={() => setShowSub((v) => !v)} title="Show step / resource prerequisite nodes">
            <Layers className="h-3 w-3" /> Steps
          </Toggle>
          <Toggle
            on={false}
            onClick={() => setRankdir((d) => (d === "LR" ? "TB" : "LR"))}
            title="Toggle layout direction"
          >
            {rankdir === "LR" ? <ArrowLeftRight className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3" />}
            {rankdir === "LR" ? "Horizontal" : "Vertical"}
          </Toggle>
          <button
            onClick={() => rf.fitView({ duration: 300 })}
            title="Fit to view"
            className="inline-flex items-center gap-1 rounded-md border border-trails-trim/40 px-2 py-1 text-trails-fg-dim hover:text-trails-accent"
          >
            <Maximize2 className="h-3 w-3" /> Fit
          </button>
          <button
            onClick={() => wrapRef.current?.requestFullscreen?.()}
            title="Fullscreen"
            className="inline-flex items-center gap-1 rounded-md border border-trails-trim/40 px-2 py-1 text-trails-fg-dim hover:text-trails-accent"
          >
            <Maximize2 className="h-3 w-3" /> Full
          </button>
          <button
            onClick={() => setLegendOpen((v) => !v)}
            title="Legend"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1",
              legendOpen
                ? "border-trails-accent text-trails-accent"
                : "border-trails-trim/40 text-trails-fg-dim hover:text-trails-accent",
            )}
          >
            <HelpCircle className="h-3 w-3" /> Legend
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative h-[calc(100vh-15rem)] min-h-[420px] w-full overflow-hidden rounded-lg border bg-trails-bg-deep"
      >
        {legendOpen && <Legend onClose={() => setLegendOpen(false)} />}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodeDoubleClick={(_e, node) => {
            const eid = (node.data as { epicId?: string }).epicId;
            if (node.type === "milestone" && eid) router.push(`/epics/${eid}`);
          }}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            style: { stroke: "var(--trails-trim)", strokeWidth: 2 },
            type: "smoothstep",
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(111, 181, 255, 0.18)" />
          <Controls className="!border !border-trails-trim/40 !bg-trails-panel" />
          <MiniMap
            pannable
            zoomable
            className="!hidden !border !border-trails-trim/40 !bg-trails-panel-dark sm:!block"
            maskColor="rgba(7, 16, 42, 0.65)"
            nodeColor={(n) => {
              if (isGroupNodeId(n.id)) return "transparent";
              const d = n.data as { status?: string; isLocked?: boolean };
              if (d?.isLocked) return "#6c7a99";
              return d?.status === "completed"
                ? "#6ee7b7"
                : d?.status === "in_progress"
                  ? "#93c5fd"
                  : d?.status === "paused"
                    ? "#ffc266"
                    : d?.status === "abandoned"
                      ? "#ff6b8a"
                      : "#4f8fd9";
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export default function TreePage() {
  return (
    <ReactFlowProvider>
      <TreeInner />
    </ReactFlowProvider>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-trails-fg-dim">
      <span className="uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[160px] rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 px-1.5 py-1 text-xs text-trails-fg focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function Toggle({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1",
        on
          ? "border-trails-accent bg-trails-accent/15 text-trails-accent"
          : "border-trails-trim/40 text-trails-fg-dim hover:text-trails-accent",
      )}
    >
      {children}
    </button>
  );
}

function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute right-2 top-2 z-10 w-60 rounded-md border border-trails-trim/50 bg-trails-panel/95 p-3 text-xs shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display uppercase tracking-widest text-trails-accent">Legend</span>
        <button onClick={onClose} className="text-trails-fg-dim hover:text-trails-fg">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="space-y-1 text-trails-fg-dim">
        <Item icon={<Circle className="h-3 w-3 text-trails-fg-dim" />} label="Not started" />
        <Item icon={<Circle className="h-3 w-3 text-trails-info" />} label="In progress" />
        <Item icon={<CheckCircle2 className="h-3 w-3 text-trails-good" />} label="Completed" />
        <Item icon={<Pause className="h-3 w-3 text-trails-warn" />} label="Paused" />
        <Item icon={<Lock className="h-3 w-3 text-trails-fg-dim" />} label="Locked by prerequisite" />
        <Item icon={<Sparkles className="h-3 w-3 text-trails-accent" />} label="Glowing ring = ready to start" />
        <Item icon={<Package className="h-3 w-3 text-trails-fg-dim" />} label="Steps toggle shows prereq chips" />
        <li className="pt-1 text-[11px] italic">
          Solid line = hard prerequisite · dashed = suggested tier order
        </li>
        <li className="text-[11px] italic">
          Drag right-edge → another to link · select an edge + Backspace to remove
        </li>
      </ul>
    </div>
  );
}

function Item({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </li>
  );
}

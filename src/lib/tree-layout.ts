import * as dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";

type TreeData = inferRouterOutputs<AppRouter>["tree"]["get"];

// Visual constants — kept here so layout + component sizing stay in sync.
// MILESTONE_W MUST equal the fixed card width in milestone-node.tsx, and
// MILESTONE_H must cover a 2-line title + chips, or Dagre under-reserves space
// and the cards overlap.
const MILESTONE_W = 240;
const MILESTONE_H = 108;
const RANK_SEP = 130;
const NODE_SEP = 48;

const SUB_OFFSET_X = 25;
const SUB_OFFSET_Y = 80;
const SUB_STEP_Y = 38;

const GROUP_PAD = 26;
const GROUP_HEAD = 22;

const STEP_PREFIX = "step:";
const RESOURCE_PREFIX = "resource:";
const GROUP_PREFIX = "epicgroup:";

export function isSubNodeId(id: string) {
  return id.startsWith(STEP_PREFIX) || id.startsWith(RESOURCE_PREFIX);
}
export function isGroupNodeId(id: string) {
  return id.startsWith(GROUP_PREFIX);
}
export function stepNodeId(stepId: string) {
  return `${STEP_PREFIX}${stepId}`;
}
export function resourceNodeId(resourceId: string) {
  return `${RESOURCE_PREFIX}${resourceId}`;
}

export type LayoutOpts = { showSubNodes?: boolean; rankdir?: "LR" | "TB" };
export type LayoutResult = { nodes: Node[]; edges: Edge[] };

export function buildTreeLayout(
  data: TreeData,
  opts: LayoutOpts = {},
): LayoutResult {
  const showSub = opts.showSubNodes ?? false;
  const rankdir = opts.rankdir ?? "LR";

  // ── Lookups for tooltip relationships ────────────────────────────
  const milestoneById = new Map(data.milestones.map((m) => [m.id, m]));
  const stepInfo = new Map(data.prereqSteps.map((s) => [s.id, s]));
  const resourceInfo = new Map(data.prereqResources.map((r) => [r.id, r]));
  const stepParent = new Map(
    data.prereqSteps.map((s) => [s.id, s.parentMilestoneId] as const),
  );
  const resourceParent = new Map(
    data.prereqResources.map((r) => [r.id, r.parentMilestoneId] as const),
  );

  // requires / unlocks / lockedBy + prereq count, per milestone.
  type Req = { name: string; met: boolean };
  const requiresOf = new Map<string, Req[]>();
  const unlocksOf = new Map<string, string[]>();
  for (const p of data.prerequisites) {
    let name = "";
    let met = false;
    if (p.requiredMilestoneId) {
      const rm = milestoneById.get(p.requiredMilestoneId);
      name = rm?.title ?? "(milestone)";
      met = rm?.status === "completed";
      const arr = unlocksOf.get(p.requiredMilestoneId) ?? [];
      const blocked = milestoneById.get(p.milestoneId);
      if (blocked) arr.push(blocked.title);
      unlocksOf.set(p.requiredMilestoneId, arr);
    } else if (p.requiredStepId) {
      const s = stepInfo.get(p.requiredStepId);
      name = s ? `Step: ${s.title}` : "(step)";
      met = s?.isCompleted ?? false;
    } else if (p.requiredResourceId) {
      const r = resourceInfo.get(p.requiredResourceId);
      name = r ? `Resource: ${r.label}` : "(resource)";
      met = r?.acquired ?? false;
    }
    const arr = requiresOf.get(p.milestoneId) ?? [];
    arr.push({ name, met });
    requiresOf.set(p.milestoneId, arr);
  }

  // ── Dagre over milestones only ───────────────────────────────────
  const subCount = new Map<string, number>();
  if (showSub) {
    for (const s of data.prereqSteps)
      subCount.set(s.parentMilestoneId, (subCount.get(s.parentMilestoneId) ?? 0) + 1);
    for (const r of data.prereqResources)
      subCount.set(r.parentMilestoneId, (subCount.get(r.parentMilestoneId) ?? 0) + 1);
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, ranksep: RANK_SEP, nodesep: NODE_SEP, edgesep: 12, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const m of data.milestones) {
    const subs = subCount.get(m.id) ?? 0;
    const h = MILESTONE_H + (subs > 0 ? SUB_OFFSET_Y - MILESTONE_H + subs * SUB_STEP_Y : 0);
    g.setNode(m.id, { width: MILESTONE_W, height: Math.max(MILESTONE_H, h) });
  }

  const seenEdges = new Set<string>();
  const addRankEdge = (from: string, to: string) => {
    const key = `${from}->${to}`;
    if (seenEdges.has(key) || from === to) return;
    seenEdges.add(key);
    if (g.hasNode(from) && g.hasNode(to)) g.setEdge(from, to);
  };
  for (const p of data.prerequisites) {
    if (p.requiredMilestoneId) addRankEdge(p.requiredMilestoneId, p.milestoneId);
    else if (p.requiredStepId) {
      const parent = stepParent.get(p.requiredStepId);
      if (parent) addRankEdge(parent, p.milestoneId);
    } else if (p.requiredResourceId) {
      const parent = resourceParent.get(p.requiredResourceId);
      if (parent) addRankEdge(parent, p.milestoneId);
    }
  }

  // Tier-chain soft edges per epic (preserve authored ordering).
  const byEpicTier = new Map<string, Map<number, string[]>>();
  for (const m of data.milestones) {
    const tm = byEpicTier.get(m.epicId) ?? new Map();
    const arr = tm.get(m.tier) ?? [];
    arr.push(m.id);
    tm.set(m.tier, arr);
    byEpicTier.set(m.epicId, tm);
  }
  for (const [, tm] of byEpicTier) {
    const tiers = [...tm.keys()].sort((a, b) => a - b);
    for (let i = 0; i < tiers.length - 1; i++) {
      addRankEdge(tm.get(tiers[i])![0], tm.get(tiers[i + 1])![0]);
    }
  }

  dagre.layout(g);

  const epicTitle = new Map(data.epics.map((e) => [e.id, e.title]));
  const epicColor = new Map(
    data.epics.map((e) => [e.id, e.category?.color ?? null]),
  );

  const positions = new Map<string, { x: number; y: number }>();
  for (const m of data.milestones) {
    const n = g.node(m.id);
    if (n) positions.set(m.id, { x: n.x - MILESTONE_W / 2, y: n.y - n.height / 2 });
  }

  // ── Milestone nodes ──────────────────────────────────────────────
  const milestoneNodes: Node[] = data.milestones.map((m) => {
    const pos = positions.get(m.id) ?? { x: 0, y: 0 };
    const reqs = requiresOf.get(m.id) ?? [];
    return {
      id: m.id,
      type: "milestone",
      position: pos,
      zIndex: 1,
      data: {
        title: m.title,
        status: m.status,
        isLocked: m.isLocked,
        available: !m.isLocked && m.status === "not_started",
        tier: m.tier,
        stepProgress: m.stepProgress,
        epicId: m.epicId,
        epicTitle: epicTitle.get(m.epicId) ?? "",
        categoryColor: epicColor.get(m.epicId) ?? null,
        urgency: m.urgency,
        startDate: m.estimatedStartDate,
        deadline: m.estimatedAchievementDate,
        description: m.description,
        skills: m.skills,
        requires: reqs.map((r) => r.name),
        lockedBy: reqs.filter((r) => !r.met).map((r) => r.name),
        unlocks: unlocksOf.get(m.id) ?? [],
        prereqCount: reqs.length,
      },
    };
  });

  // ── Optional sub-nodes (steps / resources used as prereqs) ───────
  const subNodes: Node[] = [];
  if (showSub) {
    const subsByParent = new Map<
      string,
      { kind: "step" | "resource"; id: string; data: Record<string, unknown> }[]
    >();
    for (const s of data.prereqSteps) {
      const arr = subsByParent.get(s.parentMilestoneId) ?? [];
      arr.push({
        kind: "step",
        id: stepNodeId(s.id),
        data: {
          stepId: s.id,
          title: s.title,
          isCompleted: s.isCompleted,
          parentTitle: milestoneById.get(s.parentMilestoneId)?.title ?? "",
        },
      });
      subsByParent.set(s.parentMilestoneId, arr);
    }
    for (const r of data.prereqResources) {
      const arr = subsByParent.get(r.parentMilestoneId) ?? [];
      arr.push({
        kind: "resource",
        id: resourceNodeId(r.id),
        data: {
          resourceId: r.id,
          label: r.label,
          kind: r.kind,
          acquired: r.acquired,
          parentTitle: milestoneById.get(r.parentMilestoneId)?.title ?? "",
        },
      });
      subsByParent.set(r.parentMilestoneId, arr);
    }
    for (const [parentId, subs] of subsByParent) {
      const parent = positions.get(parentId);
      if (!parent) continue;
      subs.forEach((s, i) => {
        subNodes.push({
          id: s.id,
          type: s.kind,
          position: { x: parent.x + SUB_OFFSET_X, y: parent.y + SUB_OFFSET_Y + i * SUB_STEP_Y },
          zIndex: 1,
          data: s.data,
        });
      });
    }
  }

  // ── Epic cluster backgrounds ─────────────────────────────────────
  const groupNodes: Node[] = [];
  for (const e of data.epics) {
    const ms = data.milestones.filter((m) => m.epicId === e.id);
    if (ms.length === 0) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of ms) {
      const p = positions.get(m.id);
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + MILESTONE_W);
      maxY = Math.max(maxY, p.y + MILESTONE_H);
    }
    if (!Number.isFinite(minX)) continue;
    groupNodes.push({
      id: `${GROUP_PREFIX}${e.id}`,
      type: "epicGroup",
      position: { x: minX - GROUP_PAD, y: minY - GROUP_PAD - GROUP_HEAD },
      draggable: false,
      selectable: false,
      zIndex: 0,
      data: {
        title: e.title,
        color: e.category?.color ?? "#6ea8fe",
        width: maxX - minX + GROUP_PAD * 2,
        height: maxY - minY + GROUP_PAD * 2 + GROUP_HEAD,
      },
    });
  }

  // ── Edges ────────────────────────────────────────────────────────
  const edges: Edge[] = [];
  for (const p of data.prerequisites) {
    let source = "";
    let style: React.CSSProperties | undefined;
    if (p.requiredMilestoneId) {
      source = p.requiredMilestoneId;
    } else if (p.requiredStepId && showSub) {
      source = stepNodeId(p.requiredStepId);
      style = { strokeDasharray: "5 3", stroke: "#71717a" };
    } else if (p.requiredResourceId && showSub) {
      source = resourceNodeId(p.requiredResourceId);
      style = { strokeDasharray: "5 3", stroke: "#f59e0b" };
    }
    if (!source) continue;
    edges.push({ id: p.id, source, target: p.milestoneId, type: "smoothstep", style });
  }

  // Tier-progression dashed edges (suggested order), where no hard prereq.
  const hardPairs = new Set(
    data.prerequisites
      .filter((p) => p.requiredMilestoneId)
      .map((p) => `${p.requiredMilestoneId}->${p.milestoneId}`),
  );
  for (const [, tm] of byEpicTier) {
    const tiers = [...tm.keys()].sort((a, b) => a - b);
    for (let i = 0; i < tiers.length - 1; i++) {
      for (const from of tm.get(tiers[i])!) {
        for (const to of tm.get(tiers[i + 1])!) {
          if (from === to || hardPairs.has(`${from}->${to}`)) continue;
          edges.push({
            id: `progress-${from}-${to}`,
            source: from,
            target: to,
            type: "smoothstep",
            data: { kind: "progression" },
            style: {
              stroke: "var(--trails-trim-soft)",
              strokeWidth: 1.4,
              strokeDasharray: "3 6",
              opacity: 0.4,
            },
          });
        }
      }
    }
  }

  // Group nodes first so they paint behind the rest.
  return { nodes: [...groupNodes, ...milestoneNodes, ...subNodes], edges };
}

import * as dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

/**
 * Layout + colour helpers for the Skill Constellation (the real "skill tree":
 * skills as nodes, progression edges between them). Mirrors the milestone
 * tree-layout but far simpler — no sub-nodes, one node per skill.
 */

const NODE_W = 210;
const NODE_H = 76;
const RANK_SEP = 110;
const NODE_SEP = 34;

// Stable, dark-bg-friendly colour per domain. Known domains get a curated
// hue; anything else is hashed into the palette so every domain is distinct
// and consistent across renders.
const DOMAIN_PALETTE = [
  "#6ea8fe", // blue
  "#bb9af7", // violet
  "#9ece6a", // green
  "#e0af68", // amber
  "#7dcfff", // cyan
  "#f7768e", // red
  "#ff9e64", // orange
  "#73daca", // teal
  "#f7c8e0", // pink
  "#c0caf5", // periwinkle
] as const;

const KNOWN: Record<string, string> = {
  tech: "#6ea8fe",
  software: "#6ea8fe",
  "career & tech": "#6ea8fe",
  career: "#ff9e64",
  language: "#bb9af7",
  linguistics: "#bb9af7",
  body: "#9ece6a",
  fitness: "#9ece6a",
  "health & fitness": "#9ece6a",
  health: "#73daca",
  mind: "#73daca",
  finance: "#e0af68",
  creative: "#f7c8e0",
};

export function domainColor(domain: string | null | undefined): string {
  if (!domain) return "#8aa0c6"; // neutral for ungrouped skills
  const key = domain.trim().toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DOMAIN_PALETTE[h % DOMAIN_PALETTE.length];
}

export type SkillNodeData = {
  name: string;
  level: number;
  totalXp: number;
  progress: number; // 0..1 toward next level
  xpInLevel: number;
  xpNeededForLevel: number;
  domain: string | null;
  color: string;
  milestoneCount: number;
  description: string | null;
  targetDate: string | null;
  /** Names of prerequisite skills (this skill's "parents"). */
  requires: string[];
  /** Names of skills that build on this one (its "children"). */
  unlocks: string[];
};

type SkillInput = {
  id: string;
  name: string;
  level: number;
  totalXp: number;
  progress: number;
  xpInLevel: number;
  xpNeededForLevel: number;
  domain: string | null;
  milestoneCount: number;
  description: string | null;
  targetDate: string | null;
};

type EdgeInput = { id: string; skillId: string; requiredSkillId: string };

export function buildSkillTreeLayout(
  skills: SkillInput[],
  prereqs: EdgeInput[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    edgesep: 12,
    marginx: 30,
    marginy: 30,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const s of skills) g.setNode(s.id, { width: NODE_W, height: NODE_H });

  const skillIds = new Set(skills.map((s) => s.id));
  for (const p of prereqs) {
    // edge: prerequisite → dependent (flows left → right)
    if (skillIds.has(p.requiredSkillId) && skillIds.has(p.skillId)) {
      g.setEdge(p.requiredSkillId, p.skillId);
    }
  }

  dagre.layout(g);

  // Resolve relationship names per skill from the edges.
  const nameById = new Map(skills.map((s) => [s.id, s.name]));
  const requiresBySkill = new Map<string, string[]>();
  const unlocksBySkill = new Map<string, string[]>();
  for (const p of prereqs) {
    if (!skillIds.has(p.skillId) || !skillIds.has(p.requiredSkillId)) continue;
    const reqName = nameById.get(p.requiredSkillId);
    const depName = nameById.get(p.skillId);
    if (reqName) {
      const arr = requiresBySkill.get(p.skillId) ?? [];
      arr.push(reqName);
      requiresBySkill.set(p.skillId, arr);
    }
    if (depName) {
      const arr = unlocksBySkill.get(p.requiredSkillId) ?? [];
      arr.push(depName);
      unlocksBySkill.set(p.requiredSkillId, arr);
    }
  }

  const nodes: Node[] = skills.map((s) => {
    const n = g.node(s.id);
    const color = domainColor(s.domain);
    return {
      id: s.id,
      type: "skill",
      position: n
        ? { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 }
        : { x: 0, y: 0 },
      data: {
        name: s.name,
        level: s.level,
        totalXp: s.totalXp,
        progress: s.progress,
        xpInLevel: s.xpInLevel,
        xpNeededForLevel: s.xpNeededForLevel,
        domain: s.domain,
        color,
        milestoneCount: s.milestoneCount,
        description: s.description,
        targetDate: s.targetDate,
        requires: requiresBySkill.get(s.id) ?? [],
        unlocks: unlocksBySkill.get(s.id) ?? [],
      } satisfies SkillNodeData,
    };
  });

  const edges: Edge[] = prereqs
    .filter((p) => skillIds.has(p.requiredSkillId) && skillIds.has(p.skillId))
    .map((p) => ({
      id: p.id,
      source: p.requiredSkillId,
      target: p.skillId,
      type: "smoothstep",
      animated: false,
      style: { stroke: "var(--trails-trim)", strokeWidth: 2 },
    }));

  return { nodes, edges };
}

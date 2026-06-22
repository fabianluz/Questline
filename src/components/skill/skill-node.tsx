"use client";

import { useState } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { SkillNodeData } from "@/lib/skill-tree-layout";

export type SkillFlowNode = Node<SkillNodeData, "skill">;

/**
 * A node in the Skill Constellation. Left half is a level disc whose ring
 * fills with progress; right half is the name, domain and a thin XP bar. The
 * node is tinted by the skill's domain colour.
 *
 * On hover it opens a classic-RPG item tooltip (WoW / Diablo style) via
 * NodeToolbar — which portals above the canvas so nothing clips it —
 * detailing the skill plus its parents (requires) and children (unlocks).
 *
 * Handles: target on the left (incoming prerequisites), source on the right
 * (feeds dependent skills) — drag right→left to link two skills.
 */
export function SkillNode({ data }: NodeProps<SkillFlowNode>) {
  const c = data.color;
  const pct = Math.round(data.progress * 100);
  const disc = Math.min(56, 36 + data.level * 2);
  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative flex items-center gap-2.5 rounded-lg border bg-trails-bg-deep/70 px-2.5 py-2"
      style={{ borderColor: c, borderLeftWidth: 4, width: 210 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <NodeToolbar isVisible={hover} position={Position.Right} offset={14}>
        <SkillTooltip data={data} />
      </NodeToolbar>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !bg-trails-bg-deep"
        style={{ borderColor: c }}
      />

      {/* Level disc with progress ring */}
      <div
        className="relative grid shrink-0 place-items-center rounded-full"
        style={{
          width: disc,
          height: disc,
          background: `conic-gradient(${c} ${pct}%, rgba(255,255,255,0.08) 0)`,
        }}
      >
        <div
          className="grid place-items-center rounded-full bg-trails-bg-deep"
          style={{ width: disc - 8, height: disc - 8 }}
        >
          <span className="font-display text-[7px] uppercase leading-none text-trails-fg-dim">
            Lv
          </span>
          <span
            className="font-display text-sm font-bold leading-none"
            style={{ color: c }}
          >
            {data.level}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-trails-fg">
          {data.name}
        </div>
        <div
          className="truncate text-[9px] uppercase tracking-wider"
          style={{ color: c }}
        >
          {data.domain ?? "ungrouped"}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-trails-bg-deep/90 ring-1 ring-trails-trim/30">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${pct}%`, backgroundColor: c }}
            />
          </span>
          <span className="shrink-0 font-mono text-[8px] text-trails-fg-dim">
            {data.xpInLevel}/{data.xpNeededForLevel}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !bg-trails-bg-deep"
        style={{ borderColor: c }}
      />
    </div>
  );
}

/** The classic-RPG hover card. */
function SkillTooltip({ data }: { data: SkillNodeData }) {
  const c = data.color;
  return (
    <div
      className="w-60 rounded-md border-2 bg-[#0a0f1f]/95 p-3 text-left shadow-xl backdrop-blur-sm"
      style={{ borderColor: c }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-bold" style={{ color: c }}>
          {data.name}
        </span>
        <span className="shrink-0 font-display text-[10px] uppercase tracking-wider text-trails-fg-dim">
          Lv {data.level}
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-widest text-trails-fg-dim">
        {data.domain ?? "Ungrouped"} skill
      </div>

      {/* Stats */}
      <div className="mt-2 space-y-0.5 font-mono text-[11px] text-trails-fg">
        <Row label="XP to next" value={`${data.xpInLevel} / ${data.xpNeededForLevel}`} />
        <Row label="Total XP" value={data.totalXp.toLocaleString()} />
        <Row
          label="Milestones"
          value={`${data.milestoneCount} linked`}
        />
        {data.targetDate && <Row label="Acquire by" value={data.targetDate} />}
      </div>

      {data.description && (
        <p className="mt-2 border-t border-trails-trim/30 pt-2 text-[11px] italic text-jrpg-gold-bright">
          {data.description}
        </p>
      )}

      {/* Relationships */}
      <div className="mt-2 space-y-1 border-t border-trails-trim/30 pt-2 text-[10px]">
        <Rel
          label="Requires"
          items={data.requires}
          empty="nothing — a foundation skill"
        />
        <Rel
          label="Unlocks"
          items={data.unlocks}
          empty="nothing yet"
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-trails-fg-dim">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Rel({
  label,
  items,
  empty,
}: {
  label: string;
  items: string[];
  empty: string;
}) {
  return (
    <div>
      <span className="font-display uppercase tracking-widest text-trails-accent">
        {label}
      </span>
      {items.length === 0 ? (
        <span className="ml-1 italic text-trails-fg-dim">{empty}</span>
      ) : (
        <span className="ml-1 text-trails-fg">{items.join(", ")}</span>
      )}
    </div>
  );
}

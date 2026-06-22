"use client";

import type { Node, NodeProps } from "@xyflow/react";

export type EpicGroupNodeData = {
  title: string;
  color: string;
  width: number;
  height: number;
};

export type EpicGroupFlowNode = Node<EpicGroupNodeData, "epicGroup">;

/**
 * A translucent backdrop drawn behind all of an Epic's milestones, so the
 * graph reads as distinct questlines instead of one tangle. Non-interactive
 * (pointer-events: none) so it never intercepts drags/clicks on the cards.
 */
export function EpicGroupNode({ data }: NodeProps<EpicGroupFlowNode>) {
  return (
    <div
      className="pointer-events-none rounded-xl border"
      style={{
        width: data.width,
        height: data.height,
        borderColor: `${data.color}66`,
        background: `${data.color}12`,
      }}
    >
      <div
        className="px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: data.color }}
      >
        {data.title}
      </div>
    </div>
  );
}

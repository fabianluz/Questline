"use client";

import { useState } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { CheckSquare, Square } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * StepNode — small chip that sits below its owning milestone. Click to
 * toggle completion; dependents unlock automatically.
 */
export type StepNodeData = {
  stepId: string;
  title: string;
  isCompleted: boolean;
  parentTitle?: string;
};

export type StepFlowNode = Node<StepNodeData, "step">;

export function StepNode({ data }: NodeProps<StepFlowNode>) {
  const utils = trpc.useUtils();
  const toggle = trpc.step.toggleComplete.useMutation({
    onSuccess: () => utils.tree.get.invalidate(),
  });
  const [hover, setHover] = useState(false);

  const Icon = data.isCompleted ? CheckSquare : Square;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "flex w-[200px] items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
        data.isCompleted &&
          "border-trails-good/60 text-trails-fg-dim line-through",
      )}
      style={{ borderStyle: "dashed" }}
    >
      <NodeToolbar isVisible={hover} position={Position.Top} offset={8}>
        <div className="w-52 rounded-md border-2 border-trails-trim bg-[#0a0f1f]/95 p-2.5 text-left text-[11px] shadow-xl">
          <div className="font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
            Step prerequisite
          </div>
          <div className="text-trails-fg">{data.title}</div>
          {data.parentTitle && (
            <div className="mt-1 text-[10px] text-trails-fg-dim">
              from <span className="text-trails-accent">{data.parentTitle}</span>
            </div>
          )}
          <div className="mt-1 text-[10px]">
            {data.isCompleted ? (
              <span className="text-trails-good">✓ done — unlocks dependents</span>
            ) : (
              <span className="text-trails-warn">pending — click to complete</span>
            )}
          </div>
        </div>
      </NodeToolbar>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border !border-trails-trim !bg-trails-bg-deep"
      />
      <button
        type="button"
        onClick={() => toggle.mutate({ id: data.stepId })}
        disabled={toggle.isPending}
        className="shrink-0 disabled:opacity-50"
        aria-label={data.isCompleted ? "Mark step incomplete" : "Mark step complete"}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            data.isCompleted ? "text-trails-good" : "text-trails-fg-dim",
          )}
        />
      </button>
      <span className="truncate text-trails-fg" title={data.title}>
        {data.title}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border !border-trails-trim !bg-trails-bg-deep"
      />
    </div>
  );
}

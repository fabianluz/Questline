"use client";

import { useState } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Package, PackageCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * ResourceNode — small chip that represents a Resource attached to a
 * milestone. When `acquired` is true the resource counts as obtained, and
 * any prerequisite that points to it unlocks its dependent milestone.
 */
export type ResourceNodeData = {
  resourceId: string;
  label: string;
  kind: string;
  acquired: boolean;
  parentTitle?: string;
};

export type ResourceFlowNode = Node<ResourceNodeData, "resource">;

export function ResourceNode({ data }: NodeProps<ResourceFlowNode>) {
  const utils = trpc.useUtils();
  const toggle = trpc.resource.toggleAcquired.useMutation({
    onSuccess: () => utils.tree.get.invalidate(),
  });
  const [hover, setHover] = useState(false);

  const Icon = data.acquired ? PackageCheck : Package;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "flex w-[200px] items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
        data.acquired && "border-trails-accent/60",
      )}
      style={{ borderStyle: "dashed" }}
    >
      <NodeToolbar isVisible={hover} position={Position.Top} offset={8}>
        <div className="w-52 rounded-md border-2 border-trails-trim bg-[#0a0f1f]/95 p-2.5 text-left text-[11px] shadow-xl">
          <div className="font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
            {data.kind} · resource prerequisite
          </div>
          <div className="text-trails-fg">{data.label}</div>
          {data.parentTitle && (
            <div className="mt-1 text-[10px] text-trails-fg-dim">
              from <span className="text-trails-accent">{data.parentTitle}</span>
            </div>
          )}
          <div className="mt-1 text-[10px]">
            {data.acquired ? (
              <span className="text-trails-accent">✓ acquired — unlocks dependents</span>
            ) : (
              <span className="text-trails-warn">missing — click to mark acquired</span>
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
        onClick={() => toggle.mutate({ id: data.resourceId })}
        disabled={toggle.isPending}
        className="shrink-0 disabled:opacity-50"
        aria-label={
          data.acquired ? "Mark resource missing" : "Mark resource acquired"
        }
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            data.acquired ? "text-trails-accent" : "text-trails-fg-dim",
          )}
        />
      </button>
      <span
        className={cn(
          "truncate text-trails-fg",
          data.acquired && "text-trails-fg-dim",
        )}
        title={`${data.kind}: ${data.label}`}
      >
        {data.label}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border !border-trails-trim !bg-trails-bg-deep"
      />
    </div>
  );
}

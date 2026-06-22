"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { buildSkillTreeLayout, domainColor } from "@/lib/skill-tree-layout";
import { SkillNode } from "@/components/skill/skill-node";

const nodeTypes = { skill: SkillNode };

/**
 * The Skill Constellation — skills as nodes, sized by level, coloured by
 * domain, linked by progression edges. Drag a skill's right edge onto
 * another to declare "this comes before that"; select an edge + Backspace to
 * unlink. Layout is auto-computed (Dagre, left → right) from the edges.
 */
export function SkillConstellation() {
  const utils = trpc.useUtils();
  const { data: skills } = trpc.skill.list.useQuery();
  const { data: prereqs } = trpc.skill.prerequisites.useQuery();

  const addPrereq = trpc.skill.addPrerequisite.useMutation({
    onSuccess: () => utils.skill.prerequisites.invalidate(),
  });
  const removePrereq = trpc.skill.removePrerequisite.useMutation({
    onSuccess: () => utils.skill.prerequisites.invalidate(),
  });

  // AI link suggestions (local LLM) → review modal → bulk apply.
  type Suggestion = {
    skillId: string;
    requiredSkillId: string;
    skill: string;
    requires: string;
  };
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const aiSuggest = trpc.skill.aiSuggestLinks.useMutation({
    onSuccess: (res) => {
      setSuggestions(res.links);
      setChosen(new Set(res.links.map((l) => `${l.skillId}|${l.requiredSkillId}`)));
    },
  });
  const applyLinks = trpc.skill.applyLinks.useMutation({
    onSuccess: () => {
      utils.skill.prerequisites.invalidate();
      setSuggestions(null);
    },
  });

  const { nodes, edges } = useMemo(() => {
    if (!skills) return { nodes: [], edges: [] };
    return buildSkillTreeLayout(skills, prereqs ?? []);
  }, [skills, prereqs]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      // source = the skill dragged FROM (the prerequisite),
      // target = the skill dragged TO (the dependent).
      addPrereq.mutate({ skillId: conn.target, requiredSkillId: conn.source });
    },
    [addPrereq],
  );

  const onEdgesDelete = useCallback(
    (toDelete: Edge[]) => {
      toDelete.forEach((e) => removePrereq.mutate({ id: e.id }));
    },
    [removePrereq],
  );

  const domains = useMemo(() => {
    const set = new Map<string, string>();
    for (const s of skills ?? []) {
      const key = s.domain ?? "Ungrouped";
      if (!set.has(key)) set.set(key, domainColor(s.domain));
    }
    return [...set.entries()];
  }, [skills]);

  if (!skills || skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-trails-fg-dim" />
        <p className="mt-3 text-sm text-trails-fg-dim">
          No skills yet — add some in the List view, then come back to wire up
          their progression.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border p-2.5 text-xs">
        <span className="font-display uppercase tracking-wider text-trails-fg-dim">
          Domains
        </span>
        {domains.map(([name, color]) => (
          <span key={name} className="inline-flex items-center gap-1.5 text-trails-fg">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {name}
          </span>
        ))}
        <button
          onClick={() => aiSuggest.mutate()}
          disabled={aiSuggest.isPending || skills.length < 2}
          title="Let the local LLM propose progression links between your skills"
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-trails-info bg-trails-info/15 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-trails-info hover:bg-trails-info/25 disabled:opacity-50"
        >
          {aiSuggest.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {aiSuggest.isPending ? "Thinking…" : "AI links"}
        </button>
        <span className="w-full text-trails-fg-dim">
          Drag a skill&apos;s right edge → another to set progression ·
          select an edge + Backspace to remove
        </span>
      </div>

      {error(addPrereq.error?.message ?? aiSuggest.error?.message)}

      {suggestions && (
        <SuggestionModal
          suggestions={suggestions}
          chosen={chosen}
          setChosen={setChosen}
          applying={applyLinks.isPending}
          onClose={() => setSuggestions(null)}
          onApply={() => {
            const links = suggestions
              .filter((s) => chosen.has(`${s.skillId}|${s.requiredSkillId}`))
              .map((s) => ({
                skillId: s.skillId,
                requiredSkillId: s.requiredSkillId,
              }));
            if (links.length) applyLinks.mutate({ links });
            else setSuggestions(null);
          }}
        />
      )}

      <div className="h-[calc(100vh-22rem)] min-h-[420px] w-full overflow-hidden rounded-lg border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { stroke: "var(--trails-trim)", strokeWidth: 2 },
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.2}
            color="rgba(111, 181, 255, 0.18)"
          />
          <Controls className="!border !border-trails-trim/40 !bg-trails-panel" />
          <MiniMap
            pannable
            zoomable
            className="!border !border-trails-trim/40 !bg-trails-panel-dark"
            maskColor="rgba(7, 16, 42, 0.65)"
            nodeColor={(n) =>
              ((n.data as { color?: string })?.color as string) ?? "#4f8fd9"
            }
          />
        </ReactFlow>
      </div>
    </div>
  );
}

function error(msg?: string) {
  if (!msg) return null;
  return (
    <p className="rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-xs text-trails-bad">
      {msg}
    </p>
  );
}

function SuggestionModal({
  suggestions,
  chosen,
  setChosen,
  applying,
  onApply,
  onClose,
}: {
  suggestions: { skillId: string; requiredSkillId: string; skill: string; requires: string }[];
  chosen: Set<string>;
  setChosen: (s: Set<string>) => void;
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChosen(next);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="jrpg-panel relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-jrpg-gold/40 p-4">
          <div>
            <h2 className="font-display text-base uppercase tracking-widest text-jrpg-gold-bright">
              ✦ AI suggested links
            </h2>
            <p className="mt-1 text-xs text-jrpg-muted">
              Local · pick the progression links to add
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-jrpg-gold/70 hover:text-jrpg-gold-bright"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-3">
          {suggestions.length === 0 ? (
            <p className="p-4 text-center text-xs text-trails-fg-dim">
              The model didn&apos;t find any new links to suggest. Add more
              skills (with domains/descriptions) and try again.
            </p>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s) => {
                const key = `${s.skillId}|${s.requiredSkillId}`;
                const on = chosen.has(key);
                return (
                  <li key={key}>
                    <button
                      onClick={() => toggle(key)}
                      className="flex w-full items-center gap-2 rounded-md border border-trails-trim/40 px-2 py-1.5 text-left text-xs hover:bg-trails-accent/10"
                    >
                      <span
                        className={
                          "grid h-4 w-4 shrink-0 place-items-center rounded border " +
                          (on
                            ? "border-trails-accent bg-trails-accent/20 text-trails-accent"
                            : "border-trails-trim/50 text-transparent")
                        }
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="text-trails-fg">{s.requires}</span>
                      <span className="text-trails-fg-dim">→</span>
                      <span className="font-medium text-trails-fg">{s.skill}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-jrpg-gold/40 p-3">
          <button onClick={onClose} className="jrpg-btn jrpg-btn--ghost">
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={applying || chosen.size === 0}
            className="jrpg-btn inline-flex items-center gap-1"
          >
            {applying ? "Adding…" : `Add ${chosen.size} link${chosen.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

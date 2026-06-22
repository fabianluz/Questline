"use client";

import { useEffect, useRef } from "react";
import { Plus, Sparkles, X } from "lucide-react";

type LinkedSkill = { id: string; name: string };
type AvailableSkill = { id: string; name: string; level: number };

/**
 * Inline skill chip picker used on /epics/[id] milestone rows. Linked
 * skills render as gold-trimmed chips with a small X to unlink. The
 * "link skill" affordance opens a dropdown of every available skill.
 *
 * Closes on click-outside + Escape.
 */
export function SkillLinker({
  linked,
  available,
  onLink,
  onUnlink,
}: {
  linked: LinkedSkill[];
  available: AvailableSkill[] | undefined;
  onLink: (skillId: string) => void;
  onUnlink: (skillId: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const el = ref.current;
      if (!el || !el.open) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        el.open = false;
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const linkedIds = new Set(linked.map((s) => s.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {linked.map((s) => (
        <span
          key={s.id}
          title={`Linked skill — completing this milestone grants XP to "${s.name}". Click ✕ to unlink.`}
          className="inline-flex items-center gap-1 rounded-full border border-trails-accent/60 bg-trails-accent/15 px-2 py-0.5 text-[11px] font-medium text-trails-accent"
        >
          <Sparkles className="h-2.5 w-2.5" />
          {s.name}
          <button
            type="button"
            title={`Unlink "${s.name}"`}
            onClick={() => onUnlink(s.id)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-trails-accent/20 hover:text-trails-accent-bright"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <details ref={ref} className="relative">
        <summary
          title={
            available?.length
              ? "Link a Skill so this milestone grants its XP on completion"
              : "Create a Skill first on /skills to link it here"
          }
          className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full border border-dashed border-trails-trim/60 px-2 py-0.5 text-[11px] text-trails-fg-dim hover:border-trails-accent hover:text-trails-accent"
        >
          <Plus className="h-2.5 w-2.5" />
          {available?.length ? "link skill" : "no skills yet"}
        </summary>
        {available && available.length > 0 && (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-60 overflow-auto rounded-md border-2 border-trails-trim bg-trails-panel-dark p-1 shadow-xl">
            <p className="border-b border-trails-trim/40 px-2 pb-1 font-display text-[9px] uppercase tracking-widest text-trails-accent">
              {linked.length} linked · {available.length} total
            </p>
            {available.map((s) => {
              const isLinked = linkedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (isLinked ? onUnlink(s.id) : onLink(s.id))}
                  title={
                    isLinked
                      ? `Unlink "${s.name}"`
                      : `Link "${s.name}" — completing this milestone will grant 100 XP to it`
                  }
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-trails-fg hover:bg-trails-accent/10"
                >
                  <input
                    type="checkbox"
                    checked={isLinked}
                    readOnly
                    className="pointer-events-none h-3 w-3"
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-trails-accent">
                    Lv {s.level}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </details>
    </div>
  );
}

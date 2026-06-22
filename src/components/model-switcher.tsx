"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Cpu, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/**
 * Header quick-switcher for the global active AI model (#13). Lists installed
 * models; clicking one flips the process-global default (models.setSelected)
 * and warms it. Surfaces with their own pinned model / Auto routing are
 * unaffected — this sets the fallback every surface inherits.
 */
export function ModelSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const utils = trpc.useUtils();

  const { data: selected } = trpc.models.selected.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  // Only fetch the model list once the menu opens — keeps the header cheap.
  const { data: list, isLoading } = trpc.models.list.useQuery(undefined, {
    enabled: open,
  });

  const setSelected = trpc.models.setSelected.useMutation({
    onSuccess: (r) => {
      utils.models.selected.invalidate();
      utils.models.list.invalidate();
      utils.models.surfacePrefs.invalidate();
      toast({ title: "Model switched", description: r.active, variant: "success" });
      setOpen(false);
    },
    onError: (e) =>
      toast({ title: "Couldn't switch", description: e.message, variant: "error" }),
  });

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const active = selected?.active ?? "";
  const installed = (list?.models ?? []).filter((m) => m.installed);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Active AI model: ${active || "—"}. Click to switch.`}
        aria-label="Switch AI model"
        className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-sm border border-trails-trim/70 bg-trails-panel-dark px-2 py-1 text-[11px] text-trails-fg-dim hover:text-trails-accent"
      >
        <Cpu className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden truncate font-mono lg:inline">{active || "model"}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-1 w-64 rounded-md border border-trails-trim bg-trails-panel p-1 shadow-xl">
          <p className="px-2 py-1 font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
            Active model (global)
          </p>
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-trails-fg-dim">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : installed.length === 0 ? (
            <p className="px-2 py-2 text-xs text-trails-fg-dim">
              No models installed. Pull one in More → AI Models.
            </p>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {installed.map((m) => {
                const isActive = m.selected;
                return (
                  <li key={m.ref}>
                    <button
                      onClick={() => !isActive && setSelected.mutate({ model: m.ref })}
                      disabled={setSelected.isPending}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-trails-accent/15 disabled:opacity-50",
                        isActive && "bg-trails-accent/10",
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-trails-fg">{m.label}</span>
                        <span className="truncate font-mono text-[10px] text-trails-fg-dim">
                          {m.ref}
                        </span>
                      </span>
                      {isActive && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-trails-good" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <a
            href="/models"
            className="mt-1 block rounded-sm border-t border-trails-trim/40 px-2 py-1.5 text-center font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/15"
          >
            Manage models →
          </a>
        </div>
      )}
    </div>
  );
}

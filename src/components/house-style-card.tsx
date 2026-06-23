"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";

const EXAMPLES = [
  "Responde siempre en español.",
  "Keep answers very brief — bullet points, no preamble.",
  "Address me as 'Captain' and stay upbeat.",
];

/**
 * House Style (Phase 3) — a free-text instruction appended to every AI
 * surface's persona (tone, language, length). It shapes Ask-the-Guide, the
 * Weekly Coach, break-downs, the board planner and skills — but NOT the
 * notes→JSON import, which must stay strict JSON.
 */
export function HouseStyleCard() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const { data } = trpc.models.surfacePrefs.useQuery();
  const [value, setValue] = useState("");
  const [dirty, setDirty] = useState(false);

  // Seed the textarea once the saved value loads (unless the user is editing).
  useEffect(() => {
    if (!dirty && data?.houseStyle !== undefined) setValue(data.houseStyle);
  }, [data?.houseStyle, dirty]);

  const save = trpc.models.setHouseStyle.useMutation({
    onSuccess: () => {
      setDirty(false);
      utils.models.surfacePrefs.invalidate();
      toast({ title: "House style saved", variant: "success" });
    },
    onError: (e) =>
      toast({ title: "Couldn't save", description: e.message, variant: "error" }),
  });

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-trails-accent" />
        <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
          House style
        </h2>
      </div>
      <p className="mt-1 text-[11px] text-trails-fg-dim">
        A standing instruction added to every AI persona — tone, language,
        length. Applies to the Guide, Weekly Coach, break-downs, board planner
        and skills (not the strict JSON importer).
      </p>

      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
        rows={3}
        maxLength={2000}
        placeholder="e.g. Responde siempre en español. Keep it concise."
        className="mt-3 w-full resize-y rounded-md border border-trails-trim/50 bg-trails-panel-dark px-3 py-2 text-sm text-trails-fg focus:outline-none focus:ring-1 focus:ring-trails-accent/50"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setValue(ex);
              setDirty(true);
            }}
            className="rounded-full border border-trails-trim/50 px-2 py-0.5 text-[10px] text-trails-fg-dim hover:border-trails-accent/60 hover:text-trails-accent"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {dirty && <span className="text-[10px] text-trails-fg-dim">Unsaved</span>}
        <button
          onClick={() => save.mutate({ houseStyle: value })}
          disabled={save.isPending || !dirty}
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-3 py-1.5 font-display text-xs uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20 disabled:opacity-50"
        >
          <Save className="h-3 w-3" />
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}

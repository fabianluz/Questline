"use client";

import { useRef, useState } from "react";
import {
  Boxes,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  FileUp,
  FileText,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import {
  WorkspaceBundleJson,
  summarizeImport,
  type PreviewRow,
} from "@/lib/json-shapes";
import { analyzeBundle, type BundleAnalysis } from "@/lib/import-preview";
import { bundleToMarkdown } from "@/lib/markdown-plan";

type Validation =
  | { state: "idle" }
  | { state: "error"; issues: string[] }
  | {
      state: "ok";
      bundle: WorkspaceBundleJson;
      rows: PreviewRow[];
      analysis: BundleAnalysis;
    };

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Phase 6 — frictionless one-shot import/export. A WorkspaceBundle holds the
 * full profile AND the chapter board. Validate runs entirely client-side
 * (Zod + cross-reference checks) so you see exactly what will land — and what
 * won't resolve — before committing.
 */
export function WorkspaceBundleCard() {
  const utils = trpc.useUtils();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [validation, setValidation] = useState<Validation>({ state: "idle" });
  const [profileMode, setProfileMode] = useState<"upsert" | "merge" | "replace">(
    "upsert",
  );
  const [boardMode, setBoardMode] = useState<"merge" | "replace">("merge");

  const exportQuery = trpc.workspace.export.useQuery(undefined, { enabled: false });
  const importBundle = trpc.workspace.import.useMutation({
    onSuccess: (r) => {
      utils.invalidate();
      const p = r.profile;
      const board = r.board;
      toast({
        title: "Workspace imported",
        description: `Profile: ${p.epics} epics · ${p.milestones} milestones · ${p.quests} quests${
          board ? ` · Board: ${board.chaptersCreated} chapters, ${board.nodesCreated} cards` : ""
        }`,
        variant: "success",
      });
      setText("");
      setValidation({ state: "idle" });
    },
    onError: (e) =>
      toast({ title: "Import failed", description: e.message, variant: "error" }),
  });

  function validate() {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      setValidation({
        state: "error",
        issues: [`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`],
      });
      return;
    }
    const parsed = WorkspaceBundleJson.safeParse(raw);
    if (!parsed.success) {
      setValidation({
        state: "error",
        issues: parsed.error.issues
          .slice(0, 30)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      });
      return;
    }
    setValidation({
      state: "ok",
      bundle: parsed.data,
      rows: summarizeImport("workspace", parsed.data, { maxItems: 8 }),
      analysis: analyzeBundle(parsed.data),
    });
  }

  const [mdFetching, setMdFetching] = useState(false);

  async function onExport() {
    const res = await exportQuery.refetch();
    if (res.data) {
      downloadBlob(
        `questline-workspace-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(res.data, null, 2),
        "application/json",
      );
    }
  }

  async function onExportMarkdown() {
    setMdFetching(true);
    try {
      const res = await exportQuery.refetch();
      if (res.data) {
        downloadBlob(
          `questline-master-plan-${new Date().toISOString().slice(0, 10)}.md`,
          bundleToMarkdown(res.data),
          "text/markdown",
        );
      }
    } finally {
      setMdFetching(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setValidation({ state: "idle" });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4 text-trails-accent" />
        <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
          Workspace Bundle
        </h2>
        <span className="rounded-full bg-trails-accent/15 px-2 py-0.5 text-[10px] font-medium text-trails-accent">
          profile + board
        </span>
      </div>
      <p className="mt-1 text-xs text-trails-fg-dim">
        One file with your whole plan AND your chapter board. Imported in order —
        entities first, then the board overlay. Validate runs locally before
        anything is written.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onExport}
          disabled={exportQuery.isFetching}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          <Download className="h-3 w-3" />
          {exportQuery.isFetching && !mdFetching ? "Exporting…" : "Export bundle"}
        </button>
        <button
          onClick={onExportMarkdown}
          disabled={exportQuery.isFetching}
          title="Export your whole plan as a readable Markdown master plan (great for Obsidian)."
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent disabled:opacity-50"
        >
          <FileText className="h-3 w-3" />
          {mdFetching ? "Exporting…" : "Export Markdown"}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
        >
          <FileUp className="h-3 w-3" />
          Load file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="hidden"
        />
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (validation.state !== "idle") setValidation({ state: "idle" });
        }}
        placeholder='Paste a workspace bundle JSON ({ "kind": "workspace_bundle", "profile": …, "chapterBoard": … })'
        rows={5}
        className="mt-3 w-full rounded-md border px-3 py-2 font-mono text-xs"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={validate}
          disabled={!text.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent disabled:opacity-50"
        >
          <CheckCircle2 className="h-3 w-3" />
          Validate
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-trails-fg-dim">
          Profile
          <select
            value={profileMode}
            onChange={(e) =>
              setProfileMode(e.target.value as "upsert" | "merge" | "replace")
            }
            className="rounded-md border bg-transparent px-2 py-1"
          >
            <option value="upsert">upsert</option>
            <option value="merge">merge</option>
            <option value="replace">replace</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-trails-fg-dim">
          Board
          <select
            value={boardMode}
            onChange={(e) => setBoardMode(e.target.value as "merge" | "replace")}
            className="rounded-md border bg-transparent px-2 py-1"
          >
            <option value="merge">merge</option>
            <option value="replace">replace</option>
          </select>
        </label>
        <button
          onClick={() => {
            if (validation.state !== "ok") return;
            importBundle.mutate({
              bundle: validation.bundle,
              profileMode,
              boardMode,
            });
          }}
          disabled={validation.state !== "ok" || importBundle.isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-trails-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          <Upload className="h-3 w-3" />
          {importBundle.isPending ? "Importing…" : "Import bundle"}
        </button>
      </div>

      {validation.state === "error" && (
        <div className="mt-3 rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-xs text-trails-bad">
          <p className="font-medium">Can&apos;t import — {validation.issues.length} issue(s):</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {validation.issues.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.state === "ok" && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md border border-trails-good/50 bg-trails-good/10 p-2 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-trails-good">
              <CheckCircle2 className="h-3.5 w-3.5" /> Valid bundle
            </p>
            <ul className="mt-1.5 space-y-0.5 text-trails-fg-dim">
              {validation.rows.map((r, i) => (
                <li key={i}>
                  <span className="text-trails-fg">{r.label}</span>
                  {r.value ? <span> · {r.value}</span> : null}
                </li>
              ))}
            </ul>
          </div>

          {(validation.analysis.constellationEdges > 0 ||
            validation.analysis.milestonePrereqEdges > 0 ||
            validation.analysis.totalEstimatedHours > 0 ||
            validation.analysis.boardCards > 0) && (
            <p className="text-[11px] text-trails-fg-dim">
              {validation.analysis.milestonePrereqEdges} milestone link(s) ·{" "}
              {validation.analysis.constellationEdges} skill link(s) ·{" "}
              {validation.analysis.totalEstimatedHours}h planned ·{" "}
              {validation.analysis.boardCards} board card(s)
            </p>
          )}

          {validation.analysis.issues.length > 0 ? (
            <div className="rounded-md border border-trails-warn/50 bg-trails-warn/10 p-2 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-trails-warn">
                <AlertTriangle className="h-3.5 w-3.5" />
                {validation.analysis.issues.length} thing(s) to review (import still allowed)
              </p>
              <ul className="mt-1 space-y-0.5 text-trails-fg-dim">
                {validation.analysis.issues.slice(0, 12).map((it, i) => (
                  <li key={i} className="flex gap-1.5">
                    {it.level === "warn" ? (
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-trails-warn" />
                    ) : (
                      <Info className="mt-0.5 h-3 w-3 shrink-0 text-trails-info" />
                    )}
                    <span>{it.message}</span>
                  </li>
                ))}
                {validation.analysis.issues.length > 12 && (
                  <li>… and {validation.analysis.issues.length - 12} more</li>
                )}
              </ul>
            </div>
          ) : (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs text-trails-good",
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> No cross-reference problems
              found — everything resolves.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

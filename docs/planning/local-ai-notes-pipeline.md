# Planning · Local AI series — Notes → App, on-device

**Status:** future / not started
**Reference architecture:** `src/lib/advisor.ts` (Ollama tool-calling pattern: `breakDownEpic`, `recommendResources`, `generateSideQuests`, `draftRetrospective`)
**Reference UI:** `src/app/(app)/help/tutorial/page.tsx` (the two-prompt workflow this feature replaces with a local pipeline)
**Reference data path:** `src/components/json-import-dialog.tsx` (validate → preview → confirm flow this pipeline ends in)

---

## Why

Today the user takes raw markdown notes → bounces them through an external LLM (ChatGPT / Claude / etc.) twice → pastes the resulting JSON into the Dashboard's "Import roadmap JSON" dialog. The Tutorial page already ships the two prompts that drive this manual workflow.

That two-step bounce works but:

- Notes leave the laptop.
- The user has to copy-paste between three apps.
- There's no inline verification — they're trusting the LLM blind until the final import preview.

Goal: do the entire thing inside Questline, locally via Ollama, with a verification step between every transformation.

## Workflow

A new `(app)/ai/...` route group with four sequential screens, each editable + verifiable before the next runs.

```
/ai/notes        →  /ai/restructure       →  /ai/serialize         →  /ai/commit
[paste raw]         [LLM run #1, edit]       [LLM run #2, edit]       [profile import]
```

### `/ai/notes`

- Big textarea + .md/.txt upload.
- Optional "Continue last session" if a draft exists in localStorage / a new `ai_session` table.
- Submit → kick off Ollama run #1 with the existing `HELP_PROMPT_RESTRUCTURE` prompt from `src/lib/tutorial-prompts.ts`.

### `/ai/restructure`

- Live stream output as the LLM writes the structured markdown (SSE pattern from `src/app/api/advisor/break-down/route.ts`).
- When done: render side-by-side `original notes` ↔ `structured output` editor with diff hints.
- User can edit the structured output freely before continuing.
- "Run again" reseeds the LLM with the original notes + any user edits to the structure (the editor diff becomes the prompt hint).
- "Next →" passes the structured text to /ai/serialize.

### `/ai/serialize`

- Same streaming UX, this time running `HELP_PROMPT_JSON` against the structured notes.
- When done: render the JSON in a Monaco / CodeMirror block with inline Zod validation (re-use the existing `ProfileJson` schema from `src/lib/json-shapes.ts`).
- Errors surface inline at the precise JSON path. Auto-fix button = "ask Ollama to fix this issue" with the error appended to the prompt.
- "Preview import" runs the existing `summarizeImport("profile", ...)` function from `src/lib/json-shapes.ts` and shows the same `PreviewRow[]` UI the manual import already uses (so nothing visual is duplicated).

### `/ai/commit`

- One-screen wrapper around the existing `dataio.importProfile` mutation with the same "Replace existing data" toggle.
- On success: redirect to /dashboard, flash the same "Imported: N categories, N epics, …" banner as today.

## Persistence

Add an `ai_session` table to capture in-progress conversions so the user can leave + return:

```ts
ai_session {
  id           uuid pk
  userId       text fk → user.id
  rawNotes     text       // original markdown
  structured   text       // editable after run #1
  json         text       // editable after run #2
  status       enum("notes" | "restructured" | "serialized" | "committed" | "abandoned")
  createdAt    timestamp
  updatedAt    timestamp
}
```

One row per active session, dropped on commit or after 30 days.

## Plumbing reuse

Almost nothing new at the data layer:

- LLM calls: extend `src/lib/advisor.ts` with `notesToStructured(rawNotes)` and `structuredToJson(structured)`. Both stream via the existing `ollama.chat({ stream: true })` pattern.
- Streaming endpoint: clone `/api/advisor/break-down/route.ts` as `/api/ai/restructure/route.ts` and `/api/ai/serialize/route.ts` (or a single `/api/ai/[stage]/route.ts`).
- Preview UI: reuse `summarizeImport()` + the `JsonImportDialog`'s preview step. Lift the preview rendering into its own component (`<ImportPreview rows={...} />`) so both the manual import dialog and the AI pipeline render the same widget.
- Commit: existing `dataio.importProfile` mutation.

## Tasks (rough)

1. `ai_session` table + migration.
2. tRPC `ai` router with: `startSession`, `updateSession`, `latestSession`, `commit`.
3. `lib/advisor.ts` additions: `notesToStructured`, `structuredToJson` (streaming variants).
4. SSE routes under `/api/ai/`.
5. Lift `<ImportPreview>` out of `JsonImportDialog` into a standalone component.
6. The four screens under `(app)/ai/`.
7. Auto-fix on JSON validation errors (Ollama round-trip with the error appended).
8. Nav: add "AI · Notes → App" to the More dropdown (and replace the two manual prompt buttons in the Tutorial page once the local pipeline is verified).

## Out-of-scope

- Calendar event extraction from notes (separate feature).
- Backfilling completed history from past journal entries.
- Multi-account ingestion.

## Migration story

Until this lands, the Tutorial page's two-prompt workflow is the supported path. The two prompts in `src/lib/tutorial-prompts.ts` are the SAME prompts the local pipeline will use, so anything you build / iterate on with an external LLM today carries directly into the local version.

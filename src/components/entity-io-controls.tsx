"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { JsonHelpDialog } from "@/components/json-help-dialog";
import { JsonImportDialog } from "@/components/json-import-dialog";
import { JsonExportDialog } from "@/components/json-export-dialog";
import type {
  ShapeKey,
  CategoryJson,
  SkillJson,
  EpicJson,
  QuestJson,
  AccountJson,
  BillJson,
  GoalJson,
} from "@/lib/json-shapes";

/**
 * Reusable "(?) + Import JSON" control bundle for an entity-create form.
 *
 * Drop it next to a page's existing Add button:
 *
 *   <EntityIoControls shape="quest" />
 *
 * For per-instance export (e.g. download THIS specific epic as JSON), see
 * <EntityExportButton /> below.
 */
export function EntityIoControls({
  shape,
  label,
  hint,
  className,
}: {
  shape: ShapeKey;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  // Map shape → tRPC mutation. Each is a different call site, so we pick
  // explicitly rather than generalising over the union.
  const importCategory = trpc.dataio.importCategory.useMutation();
  const importSkill = trpc.dataio.importSkill.useMutation();
  const importEpic = trpc.dataio.importEpic.useMutation();
  const importQuest = trpc.dataio.importQuest.useMutation();
  const importAccount = trpc.dataio.importAccount.useMutation();
  const importBill = trpc.dataio.importBill.useMutation();
  const importGoal = trpc.dataio.importGoal.useMutation();

  return (
    <div className={"inline-flex items-center gap-1.5 " + (className ?? "")}>
      <button
        onClick={() => setOpen(true)}
        title={hint ?? `Import a ${shape} from JSON`}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Upload className="h-3 w-3" />
        {label ?? "Import"}
      </button>
      <JsonHelpDialog shape={shape} />

      <JsonImportDialog
        open={open}
        onClose={() => setOpen(false)}
        shape={shape}
        title={shape}
        onSubmit={async (parsed) => {
          try {
            // The dialog already validated `parsed` against `shape`'s schema
            // before calling onSubmit, so each cast below is sound.
            switch (shape) {
              case "category":
                await importCategory.mutateAsync({ json: parsed as CategoryJson });
                utils.category.list.invalidate();
                break;
              case "skill":
                await importSkill.mutateAsync({ json: parsed as SkillJson });
                utils.skill.list.invalidate();
                break;
              case "epic":
                await importEpic.mutateAsync({ json: parsed as EpicJson });
                utils.epic.list.invalidate();
                utils.tree.get.invalidate();
                break;
              case "quest":
                await importQuest.mutateAsync({ json: parsed as QuestJson });
                utils.quest.list.invalidate();
                break;
              case "account":
                await importAccount.mutateAsync({ json: parsed as AccountJson });
                utils.inventory.accounts.list.invalidate();
                utils.inventory.summary.invalidate();
                break;
              case "bill":
                await importBill.mutateAsync({ json: parsed as BillJson });
                utils.inventory.bills.list.invalidate();
                break;
              case "goal":
                await importGoal.mutateAsync({ json: parsed as GoalJson });
                utils.inventory.goals.list.invalidate();
                break;
              default:
                return {
                  ok: false,
                  error: `Import not supported for ${shape}`,
                };
            }
            return { ok: true };
          } catch (err) {
            return {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }}
      />
    </div>
  );
}

/**
 * One-shot "export THIS entity as JSON" button. Fetches the entity from
 * the dataio router on click and pops the JsonExportDialog.
 *
 * Currently only `epic` is supported (the only entity with nested children
 * worth a dedicated round-trip). Categories/skills/quests/accounts/bills/
 * goals are best exported via the full Profile button on `/profile`.
 */
export function EntityExportButton({ epicId }: { epicId: string }) {
  const [open, setOpen] = useState(false);
  const exportQuery = trpc.dataio.exportEpic.useQuery(
    { id: epicId },
    { enabled: open },
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Export JSON
      </button>
      <JsonExportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Epic"
        filename={`epic-${epicId.slice(0, 8)}`}
        data={exportQuery.data ?? {}}
      />
    </>
  );
}

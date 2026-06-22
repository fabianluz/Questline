"use client";

import { useState } from "react";
import { Check, HelpCircle, Pencil, Tag, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { EntityIoControls } from "@/components/entity-io-controls";

export const PALETTE = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#0ea5e9", // sky
  "#14b8a6", // teal
  "#10b981", // emerald
  "#84cc16", // lime
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#6b7280", // gray
];

function Swatch({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Color ${color}`}
      className={cn(
        "h-7 w-7 rounded-full ring-offset-1 transition focus:outline-none",
        selected
          ? "ring-2 ring-trails-accent ring-offset-trails-bg-deep"
          : "ring-0 hover:scale-110",
      )}
      style={{ backgroundColor: color }}
    />
  );
}

export default function CategoriesPage() {
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.category.list.useQuery();

  const invalidate = () => {
    utils.category.list.invalidate();
    utils.tree.get.invalidate();
    utils.epic.list.invalidate();
  };

  const create = trpc.category.create.useMutation({
    onSuccess: () => {
      invalidate();
      setName("");
      setIcon("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const update = trpc.category.update.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });
  const del = trpc.category.delete.useMutation({ onSuccess: invalidate });

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editColor, setEditColor] = useState(PALETTE[0]);

  function startEdit(c: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
  }) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditIcon(c.icon ?? "");
    setEditColor(c.color);
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-trails-accent" />
            Categories
            <span
              title="Color-coded buckets for grouping Epics (Health, Finance, Education...). The color shows up on the Skill Tree node border-left stripe + the Roadmap sidebar dot + the per-category roadmap header."
              className="text-trails-info"
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </h1>
          <p className="mt-1 text-sm text-trails-fg-dim">
            Tag your Epics so the skill tree color-codes life areas at a glance.
          </p>
        </div>
        <EntityIoControls shape="category" />
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate({
            name: name.trim(),
            color,
            icon: icon.trim() || undefined,
          });
        }}
        className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="!m-0 !border-0 !p-0 text-sm">New Category</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[4rem_1fr_auto]">
          <input
            type="text"
            placeholder="🏷️"
            aria-label="Category icon (emoji, optional)"
            title="Optional emoji shown next to the category"
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 4))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-center text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <input
            type="text"
            placeholder="Name (e.g. Health, Finance, Education)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {create.isPending ? "Creating..." : "Add"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <Swatch
              key={c}
              color={c}
              selected={c === color}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        {error && (
          <p className="mt-2 rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-sm text-trails-bad">
            {error}
          </p>
        )}
      </form>

      <section>
        <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
          Your Categories · {categories?.length ?? 0}
        </h2>
        {isLoading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : !categories?.length ? (
          <p className="text-sm text-zinc-500">
            No categories yet. Create one above to start color-coding.
          </p>
        ) : (
          <ul className="divide-y divide-trails-trim/20 rounded-lg border">
            {categories.map((c) => (
              <li key={c.id} className="px-4 py-3">
                {editingId === c.id ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editIcon}
                        onChange={(e) => setEditIcon(e.target.value.slice(0, 4))}
                        aria-label="Category icon (emoji, optional)"
                        placeholder="🏷️"
                        className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-2 text-center text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <button
                        type="button"
                        title="Save"
                        disabled={!editName.trim() || update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: c.id,
                            name: editName.trim(),
                            color: editColor,
                            icon: editIcon.trim() || null,
                          })
                        }
                        className="rounded-md bg-zinc-900 px-2.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Cancel"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-zinc-200 px-2.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PALETTE.map((p) => (
                        <Swatch
                          key={p}
                          color={p}
                          selected={p === editColor}
                          onClick={() => setEditColor(p)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-5 w-5 shrink-0 rounded-full ring-2 ring-trails-trim/40"
                        style={{ backgroundColor: c.color }}
                        title={c.color}
                      />
                      {c.icon && (
                        <span className="text-base leading-none" aria-hidden>
                          {c.icon}
                        </span>
                      )}
                      <span className="text-sm font-medium text-trails-fg">
                        {c.name}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-trails-trim/40 bg-trails-bg-deep/60 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-trails-fg-dim">
                        {c.epicCount} {c.epicCount === 1 ? "epic" : "epics"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => startEdit(c)}
                        className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete "${c.name}"? Epics using it will become uncategorized.`,
                            )
                          ) {
                            del.mutate({ id: c.id });
                          }
                        }}
                        className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

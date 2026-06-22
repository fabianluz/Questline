"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Mountain, Search, Sparkles, Compass } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { openGuideChat } from "@/components/guide-chat";

/** Imperatively open the palette from anywhere (e.g. the header button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event("questline:command"));
}

const SCREENS: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Epics", href: "/epics" },
  { label: "Skill Tree", href: "/tree" },
  { label: "Skills · Constellation", href: "/skills" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Chapter Board", href: "/board" },
  { label: "Quests", href: "/quests" },
  { label: "Daily Journal", href: "/journal" },
  { label: "Chronicle", href: "/chronicle" },
  { label: "Notice Board", href: "/notice-board" },
  { label: "Inventory", href: "/inventory" },
  { label: "Calendar", href: "/calendar" },
  { label: "Schedule", href: "/schedule" },
  { label: "Categories", href: "/categories" },
  { label: "Trophy Room", href: "/trophy-room" },
  { label: "AI · Notes → App", href: "/ai/notes" },
  { label: "AI Models", href: "/models" },
  { label: "Profile", href: "/profile" },
];

type Item = {
  id: string;
  label: string;
  group: string;
  href?: string;
  run?: () => void;
  icon: typeof Compass;
};

/**
 * Global ⌘K / Ctrl-K command palette: fuzzy-jump to any screen, Epic, Skill,
 * or Quest. Opens on the keyboard shortcut or via openCommandPalette().
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load entities only while open.
  const { data: epics } = trpc.epic.list.useQuery(undefined, { enabled: open });
  const { data: skills } = trpc.skill.list.useQuery(undefined, { enabled: open });
  const { data: quests } = trpc.quest.list.useQuery(undefined, { enabled: open });

  // Open/close wiring: ⌘K / Ctrl-K + custom event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onEvt() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("questline:command", onEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("questline:command", onEvt);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [
      {
        id: "action:guide",
        label: "Ask the Guide",
        group: "Action",
        run: openGuideChat,
        icon: Compass,
      },
    ];
    for (const s of SCREENS)
      out.push({
        id: `screen:${s.href}`,
        label: s.label,
        group: "Go to",
        href: s.href,
        icon: Compass,
      });
    for (const e of epics ?? [])
      out.push({ id: `epic:${e.id}`, label: e.title, group: "Epic", href: `/epics/${e.id}`, icon: Mountain });
    for (const s of skills ?? [])
      out.push({ id: `skill:${s.id}`, label: s.name, group: "Skill", href: "/skills", icon: Sparkles });
    for (const qq of quests ?? [])
      out.push({ id: `quest:${qq.id}`, label: qq.title, group: "Quest", href: qq.cadence === "one_off" ? "/notice-board" : "/quests", icon: Flame });
    return out;
  }, [epics, skills, quests]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? items.filter((i) => i.label.toLowerCase().includes(term))
      : items;
    return list.slice(0, 40);
  }, [items, q]);

  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const go = (item: Item) => {
    setOpen(false);
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="jrpg-panel w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-jrpg-gold/40 px-3 py-2">
          <Search className="h-4 w-4 text-jrpg-gold/70" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && filtered[active]) {
                go(filtered[active]);
              }
            }}
            placeholder="Search screens, epics, skills, quests…"
            className="flex-1 bg-transparent text-sm text-trails-fg placeholder:text-trails-fg-dim focus:outline-none"
          />
          <kbd className="rounded border border-jrpg-gold/40 px-1 text-[9px] text-jrpg-gold/70">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-trails-fg-dim">
              No matches.
            </li>
          ) : (
            filtered.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm",
                      i === active
                        ? "bg-trails-accent/20 text-trails-accent-bright"
                        : "text-trails-fg hover:bg-trails-accent/10",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-trails-fg-dim" />
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="shrink-0 font-display text-[9px] uppercase tracking-widest text-trails-fg-dim">
                      {item.group}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

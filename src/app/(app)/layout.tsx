"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Compass, Menu, Search, X } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { SystemHealthBanner } from "@/components/system-health-banner";
import { ToastProvider } from "@/components/toast";
import { CommandPalette, openCommandPalette } from "@/components/command-palette";
import { FocusTimer } from "@/components/focus-timer";
import { GuideChat, openGuideChat } from "@/components/guide-chat";
import { ModelSwitcher } from "@/components/model-switcher";
import { useAutoBackup } from "@/lib/use-auto-backup";

/**
 * Navigation grouped by use frequency:
 *   Primary (always visible on desktop): screens you open multiple times a day.
 *   More menu (dropdown):                screens you visit weekly or rarely.
 * On small screens everything collapses into a hamburger drawer.
 */
const primaryLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/epics", label: "Epics" },
  { href: "/tree", label: "Skill Tree" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/board", label: "Chapter Board" },
  { href: "/quests", label: "Quests" },
  { href: "/inventory", label: "Inventory" },
];

const moreLinks = [
  { href: "/journal", label: "Daily Journal" },
  { href: "/notice-board", label: "Notice Board" },
  { href: "/calendar", label: "Calendar" },
  { href: "/schedule", label: "Schedule" },
  { href: "/categories", label: "Categories" },
  { href: "/skills", label: "Skills" },
  { href: "/chronicle", label: "Chronicle" },
  { href: "/trophy-room", label: "Trophy Room" },
  { href: "/ai/notes", label: "AI · Notes → App" },
  { href: "/models", label: "AI Models" },
  { href: "/profile", label: "Profile" },
];

const allLinks = [...primaryLinks, ...moreLinks];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const { data: prefs } = trpc.wellbeing.getPreferences.useQuery(undefined, {
    enabled: !!session,
  });
  const { data: attention } = trpc.attention.summary.useQuery(undefined, {
    enabled: !!session,
    refetchInterval: 60_000,
  });
  const badgeFor = (href: string) =>
    href === "/quests"
      ? (attention?.questsPending ?? 0)
      : href === "/roadmap"
        ? (attention?.overdueMilestones ?? 0)
        : 0;
  const [mobileOpen, setMobileOpen] = useState(false);

  // Daily local safety-net backup once onboarding is complete.
  useAutoBackup(!!session && prefs?.onboardingStep === "done");

  // Onboarding gate.
  useEffect(() => {
    if (!session || !prefs) return;
    if (prefs.onboardingStep !== "done" && !pathname.startsWith("/onboarding")) {
      router.replace("/onboarding");
    }
  }, [session, prefs?.onboardingStep, pathname, router, prefs]);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [pathname]);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <ToastProvider>
      <CommandPalette />
      <FocusTimer />
      <GuideChat />
      <div className="flex min-h-full flex-1 flex-col">
        <SystemHealthBanner />

        <header className="sticky top-0 z-50 border-b-2 border-trails-trim bg-trails-panel/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link
                href="/dashboard"
                className="font-display text-lg font-bold tracking-widest text-trails-accent drop-shadow-[0_1px_0_rgba(0,0,0,0.6)]"
              >
                ✦ QUESTLINE
              </Link>
              {/* Desktop nav */}
              <nav className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm md:flex">
                {primaryLinks.map((link) => {
                  const badge = badgeFor(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "relative rounded-sm px-1.5 py-0.5 font-display text-[12px] uppercase tracking-wider text-trails-fg-dim transition-colors hover:bg-trails-accent/15 hover:text-trails-accent",
                        pathname.startsWith(link.href) &&
                          "bg-trails-accent/20 text-trails-accent",
                      )}
                    >
                      {link.label}
                      {badge > 0 && <NavBadge count={badge} />}
                    </Link>
                  );
                })}
                <MoreMenu pathname={pathname} />
              </nav>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <ModelSwitcher />
              <button
                onClick={openGuideChat}
                title="Ask the Guide"
                aria-label="Ask the Guide"
                className="inline-flex items-center gap-1.5 rounded-sm border border-jrpg-gold/40 bg-trails-panel-dark px-2 py-1 text-[11px] text-trails-fg-dim hover:text-jrpg-gold"
              >
                <Compass className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Guide</span>
              </button>
              <button
                onClick={openCommandPalette}
                title="Search & jump (⌘K)"
                aria-label="Open command palette"
                className="inline-flex items-center gap-1.5 rounded-sm border border-trails-trim/70 bg-trails-panel-dark px-2 py-1 text-[11px] text-trails-fg-dim hover:text-trails-accent"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Search</span>
                <kbd className="hidden rounded border border-trails-trim/60 px-1 text-[9px] lg:inline">
                  ⌘K
                </kbd>
              </button>
              {!isPending && session && (
                <button
                  onClick={handleSignOut}
                  className="hidden rounded-sm border border-trails-trim/70 bg-trails-panel-dark px-2.5 py-1 font-display text-[11px] uppercase tracking-wider text-trails-accent hover:bg-trails-panel hover:text-trails-fg sm:inline-block"
                >
                  Sign out
                </button>
              )}
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileOpen((v) => !v)}
                aria-label={mobileOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileOpen}
                className="rounded-sm border border-trails-trim/70 p-1.5 text-trails-accent md:hidden"
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Mobile drawer */}
          {mobileOpen && (
            <nav className="border-t border-trails-trim/40 bg-trails-panel px-4 py-3 md:hidden">
              <div className="grid grid-cols-2 gap-1">
                {allLinks.map((l) => {
                  const badge = badgeFor(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={cn(
                        "flex items-center justify-between rounded-sm px-2 py-1.5 font-display text-[12px] uppercase tracking-wider text-trails-fg-dim hover:bg-trails-accent/15 hover:text-trails-accent",
                        pathname.startsWith(l.href) &&
                          "bg-trails-accent/20 text-trails-accent",
                      )}
                    >
                      {l.label}
                      {badge > 0 && (
                        <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-trails-bad px-1 text-[9px] font-bold text-white">
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
              {!isPending && session && (
                <button
                  onClick={handleSignOut}
                  className="mt-3 w-full rounded-sm border border-trails-trim/70 px-2.5 py-1.5 font-display text-[11px] uppercase tracking-wider text-trails-accent"
                >
                  Sign out
                </button>
              )}
            </nav>
          )}
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}

/** Small red count bubble pinned to the top-right of a nav link. */
function NavBadge({ count }: { count: number }) {
  return (
    <span className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-trails-bad px-1 text-[8px] font-bold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function MoreMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const activeInside = moreLinks.some((l) => pathname.startsWith(l.href));

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-display text-[12px] uppercase tracking-wider text-trails-fg-dim transition-colors hover:bg-trails-accent/15 hover:text-trails-accent",
          activeInside && "bg-trails-accent/20 text-trails-accent",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        More
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 min-w-[180px] rounded-md border-2 border-trails-trim bg-trails-panel py-1 shadow-xl"
        >
          {moreLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              className={cn(
                "block px-3 py-1.5 font-display text-[12px] uppercase tracking-wider text-trails-fg-dim hover:bg-trails-accent/15 hover:text-trails-accent",
                pathname.startsWith(l.href) && "text-trails-accent bg-trails-accent/10",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

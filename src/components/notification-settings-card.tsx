"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, HelpCircle, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useNotificationScheduler } from "@/lib/use-notification-scheduler";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

function detectPermission(): PermissionState {
  if (typeof window === "undefined") return "default";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

/** Desktop build exposes a native notifier — no browser permission needed. */
function hasNativeNotify(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as { questline?: { notify?: unknown } })
    .questline?.notify === "function";
}

// React's SSR returns "default" because there's no Notification API on the
// server. Reading the real permission state directly inside useState causes
// the client's first render to diverge from the server payload → React
// flags a hydration mismatch. We keep the initial state at "default"
// universally and resolve the real value in an effect post-mount.

/**
 * Dashboard widget: foreground browser notifications via the Web
 * Notifications API. Polled by useNotificationScheduler() so reminders
 * fire while the tab is open. No remote push service — 100% local.
 */
export function NotificationSettingsCard() {
  useNotificationScheduler();

  const { data: prefs, isLoading } = trpc.notification.getPreferences.useQuery();
  const utils = trpc.useUtils();
  const save = trpc.notification.updatePreferences.useMutation({
    onSuccess: () => utils.notification.getPreferences.invalidate(),
  });

  const [permission, setPermission] = useState<PermissionState>("default");
  const [native, setNative] = useState(false);

  // Hydration-safe: detect native bridge / permission AFTER mount. In the
  // desktop build, native OS notifications need no permission, so we treat the
  // state as already granted.
  useEffect(() => {
    if (hasNativeNotify()) {
      setNative(true);
      setPermission("granted");
    } else {
      setPermission(detectPermission());
    }
  }, []);
  const [draft, setDraft] = useState<{
    questReminderTime: string;
    milestoneReminderDays: number;
    billReminderDays: number;
    dailyDigest: boolean;
    digestTime: string;
    quietHoursEnabled: boolean;
    quietStart: string;
    quietEnd: string;
  }>({
    questReminderTime: "18:00",
    milestoneReminderDays: 7,
    billReminderDays: 3,
    dailyDigest: false,
    digestTime: "08:00",
    quietHoursEnabled: false,
    quietStart: "22:00",
    quietEnd: "07:00",
  });

  useEffect(() => {
    if (prefs) {
      setDraft({
        questReminderTime: prefs.questReminderTime,
        milestoneReminderDays: prefs.milestoneReminderDays,
        billReminderDays: prefs.billReminderDays,
        dailyDigest: prefs.dailyDigest,
        digestTime: prefs.digestTime,
        quietHoursEnabled: prefs.quietHoursEnabled,
        quietStart: prefs.quietStart,
        quietEnd: prefs.quietEnd,
      });
    }
  }, [prefs]);

  async function requestPermission() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
    if (result === "granted") {
      save.mutate({ enabled: true });
      new Notification("Questline notifications on", {
        body: "You'll be reminded about quests, milestones, and bills.",
        tag: "questline-welcome",
      });
    }
  }

  function toggleEnabled(next: boolean) {
    if (next && permission !== "granted") {
      requestPermission();
      return;
    }
    save.mutate({ enabled: next });
  }

  function saveField<K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
    save.mutate({ [key]: value } as never);
  }

  const enabled = !!prefs?.enabled;
  const permissionBlocked =
    permission === "denied" || permission === "unsupported";

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {enabled && permission === "granted" ? (
            <Bell className="h-4 w-4 text-trails-good" />
          ) : (
            <BellOff className="h-4 w-4 text-trails-fg-dim" />
          )}
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            {native ? "Desktop notifications" : "Browser notifications"}
          </h2>
          <span
            title={
              native
                ? "Native macOS reminders. Fire even when the Questline window is closed (as long as the app is running). Daily quests remind at the time you set; milestones + bills remind N days before their target date. 100% local."
                : "Foreground reminders via the Web Notifications API. Fires while the Questline tab is open — no remote push service. Daily quests remind at the time you set; milestones + bills remind N days before their target date."
            }
            className="text-trails-info"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        {permission === "granted" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-trails-good/60 bg-trails-good/15 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-trails-good">
            <Check className="h-2.5 w-2.5" /> {native ? "native" : "permission granted"}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-trails-fg-dim">
        {native
          ? "Native OS reminders — fire even when the window is closed (while the app runs). 100% local."
          : "Fires only while the Questline tab is open. 100% local — no remote push service."}
      </p>

      {isLoading ? (
        <p className="mt-3 text-sm text-trails-fg-dim">Loading...</p>
      ) : permission === "unsupported" ? (
        <BlockNotice>
          This browser does not support the Web Notifications API.
        </BlockNotice>
      ) : permission === "denied" ? (
        <BlockNotice>
          Notifications were blocked at the OS / browser level. Allow them
          in your browser's site settings to re-enable.
        </BlockNotice>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3 border-b border-trails-trim/30 pb-3">
            <label className="font-display text-[11px] uppercase tracking-widest text-trails-accent">
              Enabled
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => toggleEnabled(!enabled)}
              disabled={save.isPending || permissionBlocked}
              title={
                enabled
                  ? "Disable browser notifications"
                  : "Enable browser notifications (will prompt for permission first if needed)"
              }
              className={
                "relative inline-flex h-5 w-9 items-center rounded-full border transition disabled:opacity-50 " +
                (enabled
                  ? "border-trails-good bg-trails-good/30"
                  : "border-trails-trim/40 bg-trails-bg-deep/60")
              }
            >
              <span
                className={
                  "inline-block h-3.5 w-3.5 transform rounded-full shadow transition " +
                  (enabled
                    ? "translate-x-4 bg-trails-good"
                    : "translate-x-0.5 bg-trails-fg-dim")
                }
              />
            </button>
          </div>

          {permission === "default" && (
            <button
              type="button"
              onClick={requestPermission}
              title="Open the browser's native permission prompt"
              className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Grant browser permission
            </button>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Field label="Quest reminder (local)">
              <input
                type="time"
                value={draft.questReminderTime}
                onChange={(e) =>
                  saveField("questReminderTime", e.target.value)
                }
                disabled={!enabled}
                title="When daily quests pending after this time-of-day should fire reminders"
                className="w-full rounded-md px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
            </Field>
            <Field label="Milestone lead (days)">
              <input
                type="number"
                min={0}
                max={60}
                value={draft.milestoneReminderDays}
                onChange={(e) =>
                  saveField(
                    "milestoneReminderDays",
                    Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                  )
                }
                disabled={!enabled}
                title="Fire a reminder this many days before a milestone's target date"
                className="w-full rounded-md px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
            </Field>
            <Field label="Bill lead (days)">
              <input
                type="number"
                min={0}
                max={60}
                value={draft.billReminderDays}
                onChange={(e) =>
                  saveField(
                    "billReminderDays",
                    Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                  )
                }
                disabled={!enabled}
                title="Fire a reminder this many days before a bill's nextDueDate"
                className="w-full rounded-md px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
            </Field>
          </div>

          {/* Daily digest: one summary instead of many pings. */}
          <div className="flex items-center justify-between gap-3 border-t border-trails-trim/30 pt-3">
            <div>
              <label className="font-display text-[11px] uppercase tracking-widest text-trails-accent">
                Daily digest
              </label>
              <p className="text-[11px] text-trails-fg-dim">
                One summary at a set time instead of individual reminders.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={draft.digestTime}
                onChange={(e) => saveField("digestTime", e.target.value)}
                disabled={!enabled || !draft.dailyDigest}
                title="When the daily summary should fire"
                className="rounded-md px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
              <button
                type="button"
                role="switch"
                aria-checked={draft.dailyDigest}
                aria-label="Toggle daily digest"
                onClick={() => saveField("dailyDigest", !draft.dailyDigest)}
                disabled={!enabled || save.isPending}
                className={
                  "relative inline-flex h-5 w-9 items-center rounded-full border transition disabled:opacity-50 " +
                  (draft.dailyDigest
                    ? "border-trails-good bg-trails-good/30"
                    : "border-trails-trim/40 bg-trails-bg-deep/60")
                }
              >
                <span
                  className={
                    "inline-block h-3.5 w-3.5 transform rounded-full shadow transition " +
                    (draft.dailyDigest
                      ? "translate-x-4 bg-trails-good"
                      : "translate-x-0.5 bg-trails-fg-dim")
                  }
                />
              </button>
            </div>
          </div>

          {/* Quiet hours: suppress everything inside a window (local time). */}
          <div className="flex items-center justify-between gap-3 border-t border-trails-trim/30 pt-3">
            <div>
              <label className="font-display text-[11px] uppercase tracking-widest text-trails-accent">
                Quiet hours (local)
              </label>
              <p className="text-[11px] text-trails-fg-dim">
                No notifications fire inside this window (wraps past midnight).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={draft.quietStart}
                onChange={(e) => saveField("quietStart", e.target.value)}
                disabled={!enabled || !draft.quietHoursEnabled}
                title="Quiet hours start"
                className="rounded-md px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
              <span className="text-[11px] text-trails-fg-dim">→</span>
              <input
                type="time"
                value={draft.quietEnd}
                onChange={(e) => saveField("quietEnd", e.target.value)}
                disabled={!enabled || !draft.quietHoursEnabled}
                title="Quiet hours end"
                className="rounded-md px-2 py-1 text-xs tabular-nums disabled:opacity-50"
              />
              <button
                type="button"
                role="switch"
                aria-checked={draft.quietHoursEnabled}
                aria-label="Toggle quiet hours"
                onClick={() =>
                  saveField("quietHoursEnabled", !draft.quietHoursEnabled)
                }
                disabled={!enabled || save.isPending}
                className={
                  "relative inline-flex h-5 w-9 items-center rounded-full border transition disabled:opacity-50 " +
                  (draft.quietHoursEnabled
                    ? "border-trails-good bg-trails-good/30"
                    : "border-trails-trim/40 bg-trails-bg-deep/60")
                }
              >
                <span
                  className={
                    "inline-block h-3.5 w-3.5 transform rounded-full shadow transition " +
                    (draft.quietHoursEnabled
                      ? "translate-x-4 bg-trails-good"
                      : "translate-x-0.5 bg-trails-fg-dim")
                  }
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function BlockNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-trails-warn/60 bg-trails-warn/10 p-2 text-xs text-trails-warn">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block font-display text-[10px] uppercase tracking-widest text-trails-accent">
        {label}
      </label>
      {children}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { trpc } from "./trpc";

/**
 * Foreground notification scheduler.
 *
 * Strategy: while the app is open, poll the server every 5 minutes for the
 * list of pending notifications (already deduped against today's log on the
 * server). For each one, fire `new Notification(...)`, then call `markFired`
 * so it never repeats.
 *
 * Desktop build: fires NATIVE OS notifications via the Electron bridge
 * (window.questline.notify) — these show even when the window is hidden, and
 * need no browser permission. On the web it falls back to the Web
 * Notifications API (foreground only, permission-gated).
 *
 * Times are gated in the user's LOCAL time: we send the browser's timezone
 * offset to the server so a "21:00" reminder fires at 21:00 local, not UTC.
 *
 * The hook is safe to mount unconditionally — it short-circuits when
 * notifications are unavailable or the user has disabled them.
 */

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Native desktop notifier (Electron preload), present only in the app build. */
function nativeNotify():
  | ((title: string, body: string) => Promise<unknown>)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    questline?: { notify?: (t: string, b: string) => Promise<unknown> };
  };
  return w.questline?.notify ?? null;
}

export function useNotificationScheduler() {
  const utils = trpc.useUtils();
  const markFired = trpc.notification.markFired.useMutation();
  const { data: prefs } = trpc.notification.getPreferences.useQuery(undefined, {
    // Polling preferences too cheap to skip; lets toggling the setting in
    // another tab take effect within a minute.
    refetchInterval: 60_000,
  });

  // Track which (kind+refId) we already fired *this session* so we don't
  // double-fire between the markFired call and the server reflecting it.
  const firedThisSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!prefs?.enabled) return;

    const native = nativeNotify();
    // Native (desktop) needs no permission; web requires it to be granted.
    if (!native) {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
    }

    let cancelled = false;

    async function fireRound() {
      if (cancelled) return;
      try {
        // Send the local timezone offset so reminder/quiet times are evaluated
        // against the user's wall clock, not the server's UTC.
        const pending = await utils.notification.getPending.fetch({
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        });
        for (const n of pending) {
          const key = `${n.kind}:${n.refId}`;
          if (firedThisSession.current.has(key)) continue;
          firedThisSession.current.add(key);
          try {
            if (native) {
              await native(n.title, n.body);
            } else {
              new Notification(n.title, {
                body: n.body,
                tag: n.tag,
                icon: "/favicon.ico",
                silent: false,
              });
            }
            await markFired.mutateAsync({
              kind: n.kind,
              refId: n.refId,
            });
          } catch (err) {
            // If the OS rejects the notification (rare), still mark fired so
            // we don't loop forever on a bad payload.
            console.warn("Notification fire failed:", err);
            firedThisSession.current.delete(key);
          }
        }
      } catch (err) {
        console.warn("Notification poll failed:", err);
      }
    }

    // Fire immediately on enable, then on an interval.
    fireRound();
    const id = window.setInterval(fireRound, POLL_INTERVAL_MS);

    // Also re-check on focus — laptop wake or tab return is the common case
    // where "you've crossed the reminder time" first becomes true.
    function onVisible() {
      if (document.visibilityState === "visible") fireRound();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [prefs?.enabled, utils, markFired]);
}

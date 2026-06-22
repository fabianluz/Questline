"use client";

import { useState } from "react";
import {
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CalendarExportBundleModal } from "@/components/calendar-export-bundle-modal";

/**
 * Per-user secret subscription URL that calendar apps (Apple Calendar /
 * Google Calendar / Outlook) can subscribe to. Token is rotatable — if you
 * shared the URL accidentally, Rotate to invalidate it.
 *
 * Trails palette: cyan accent for the calendar identity, gold accents for
 * primary actions, dim trim for utility buttons.
 */
export function CalendarSubscriptionCard() {
  const { data, isLoading } = trpc.calendar.getFeed.useQuery();
  const utils = trpc.useUtils();
  const rotate = trpc.calendar.regenerateToken.useMutation({
    onSuccess: () => {
      utils.calendar.getFeed.invalidate();
      setReveal(false);
    },
  });

  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const host = typeof window === "undefined" ? "" : window.location.host;
  const httpsUrl = data
    ? `${window.location.origin}/api/calendar/${data.token}/feed.ics`
    : "";
  const webcalUrl = data
    ? `webcal://${host}/api/calendar/${data.token}/feed.ics`
    : "";

  function maskedUrl(): string {
    if (!data) return "";
    return `${window.location.origin}/api/calendar/${"•".repeat(12)}/feed.ics`;
  }

  function copy() {
    if (!httpsUrl) return;
    navigator.clipboard.writeText(httpsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onRotate() {
    if (
      confirm(
        "Rotate the subscription token? Any calendar app already subscribed to the old URL will stop receiving updates until you re-subscribe.",
      )
    ) {
      rotate.mutate();
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-trails-info" />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Calendar subscription
          </h2>
          <span
            title="A secret per-user URL that any calendar app can subscribe to (Apple Calendar / Google Calendar / Outlook). The feed contains milestones with target dates, daily + weekly quests as recurring events, side-quests, bills, and (optionally) steps auto-scheduled into your work-window. Rotate the token if you ever share the URL by accident."
            className="text-trails-info"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <button
          onClick={onRotate}
          disabled={rotate.isPending}
          title="Rotate the secret token — old subscribers will stop syncing until they re-subscribe with the new URL"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:text-trails-accent disabled:opacity-50"
        >
          <RefreshCw
            className={rotate.isPending ? "h-3 w-3 animate-spin" : "h-3 w-3"}
          />
          Rotate
        </button>
      </div>

      <p className="mt-1 text-xs text-trails-fg-dim">
        Subscribe in Apple Calendar / Google Calendar / Outlook. Refresh
        suggested hourly. Or build a custom one-shot bundle via Export.
      </p>

      {isLoading ? (
        <p className="mt-3 text-sm text-trails-fg-dim">Loading...</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <code
              className="flex-1 truncate rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 px-2 py-1.5 font-mono text-[11px] text-trails-accent"
              title={
                reveal
                  ? "Secret URL revealed — never share this in a chat or commit"
                  : "Click the eye icon to reveal"
              }
            >
              {reveal ? httpsUrl : maskedUrl()}
            </code>
            <button
              onClick={() => setReveal((r) => !r)}
              title={reveal ? "Hide URL" : "Reveal URL"}
              className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-accent"
            >
              {reveal ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={copy}
              title="Copy URL to clipboard"
              className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-accent"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-trails-good" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={webcalUrl}
              title="Opens macOS Calendar's subscription dialog automatically"
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              <ExternalLink className="h-3 w-3" />
              Subscribe in Apple Calendar
            </a>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              title="Pick exactly which events to include in a one-shot downloadable .ics"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:text-trails-accent"
            >
              <Download className="h-3 w-3" />
              Export bundle (.ics)
            </button>
          </div>
          <CalendarExportBundleModal
            open={exportOpen}
            onClose={() => setExportOpen(false)}
          />
          <p className="text-[10px] text-trails-fg-dim">
            URL is secret — keep it private. Hit Rotate to invalidate it if
            you've shared it by accident.
          </p>
        </div>
      )}
    </section>
  );
}

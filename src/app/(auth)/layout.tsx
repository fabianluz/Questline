import Link from "next/link";
import { SystemHealthBanner } from "@/components/system-health-banner";

/**
 * Auth chrome — Trails/FFX-styled menu panel centered on a starfield.
 * The cascading `.rounded-lg.border` rule paints the inner card, so this
 * layout just provides the outer brand crest and the local-only footer.
 *
 * The SystemHealthBanner runs here too. If Postgres is down when the user
 * lands on /sign-in, they'd otherwise see a generic "Failed to get
 * session" with no indication of why — the banner explains it up-front +
 * lets them start OrbStack from the page.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SystemHealthBanner />
      <div className="relative flex flex-1 items-center justify-center p-6">
        <Link
          href="/sign-in"
          className="absolute top-8 left-1/2 -translate-x-1/2 select-none font-display text-xl font-bold tracking-[0.35em] text-trails-accent drop-shadow-[0_1px_0_rgba(0,0,0,0.6)]"
        >
          ✦ QUESTLINE
        </Link>

        <div className="w-full max-w-sm rounded-lg border p-8 shadow-lg">
          {children}
        </div>

        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim">
          Local · No cloud · No telemetry
        </p>
      </div>
    </div>
  );
}

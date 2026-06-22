"use client";

import { useEffect, useRef } from "react";
import { Shield, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { playerLevel } from "@/lib/player";
import { useToast } from "@/components/toast";

const STORE_KEY = "questline:player-level";

/**
 * Hero banner: the character's overall level, rank title, and XP toward the
 * next level — aggregated across every skill. When the level ticks up between
 * visits we fire a celebratory toast (compared against a localStorage marker).
 */
export function PlayerHeroCard() {
  const { data: skills } = trpc.skill.list.useQuery();
  const toast = useToast();
  const celebrated = useRef(false);

  const stats = playerLevel(skills ?? []);

  useEffect(() => {
    if (!skills || celebrated.current) return;
    const prev = Number(localStorage.getItem(STORE_KEY) ?? "NaN");
    if (!Number.isNaN(prev) && stats.level > prev) {
      celebrated.current = true;
      toast({
        title: `Level up! You reached level ${stats.level}`,
        description: `New rank: ${stats.rank}. ${stats.xpToNext.toLocaleString()} XP to the next level.`,
        variant: "success",
      });
    }
    localStorage.setItem(STORE_KEY, String(stats.level));
  }, [skills, stats.level, stats.rank, stats.xpToNext, toast]);

  const pct = Math.round(stats.progress * 100);

  return (
    <section className="jrpg-panel relative overflow-hidden p-5">
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-jrpg-gold/70 bg-trails-panel-dark">
          <Shield className="h-7 w-7 text-jrpg-gold" aria-hidden />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-jrpg-gold/70 bg-trails-panel font-display text-sm font-bold text-jrpg-gold">
            {stats.level}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-lg font-bold uppercase tracking-widest text-trails-accent">
              {stats.rank}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-trails-fg-dim">
              <Star className="h-3 w-3 text-jrpg-gold" aria-hidden />
              Level {stats.level}
            </span>
          </div>

          <div className="mt-2">
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-trails-panel-dark"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Level ${stats.level} progress`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-jrpg-gold/70 to-jrpg-gold"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-trails-fg-dim">
              <span>{stats.totalXp.toLocaleString()} XP total</span>
              <span>
                {stats.xpToNext.toLocaleString()} XP to level {stats.level + 1}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

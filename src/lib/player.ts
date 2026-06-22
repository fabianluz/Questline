import { levelProgress } from "@/lib/xp";

/**
 * The character's overall level is derived from the TOTAL XP earned across
 * every skill (milestone completions + quest streaks). One global curve, so a
 * broad player and a specialist both feel progression.
 */
export type PlayerStats = ReturnType<typeof playerLevel>;

// Flavor rank shown next to the level — Trails/FFX style class titles.
const RANK_TITLES = [
  "Wanderer", // 0–4
  "Apprentice", // 5–9
  "Adept", // 10–14
  "Vanguard", // 15–19
  "Paladin", // 20–24
  "Sky Knight", // 25–29
  "Grandmaster", // 30+
] as const;

export function rankTitle(level: number): string {
  const i = Math.min(RANK_TITLES.length - 1, Math.floor(level / 5));
  return RANK_TITLES[i];
}

export function playerLevel(skills: { totalXp: number }[]) {
  const totalXp = skills.reduce((sum, s) => sum + (s.totalXp || 0), 0);
  const progress = levelProgress(totalXp);
  return { ...progress, rank: rankTitle(progress.level), skillCount: skills.length };
}

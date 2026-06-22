// Each completed milestone linked to a skill grants this much XP.
export const XP_PER_MILESTONE = 100;

// Polynomial curve: level N requires N² × XP_PER_MILESTONE total XP.
// Lv 1 = 100 XP, Lv 2 = 400, Lv 3 = 900, Lv 5 = 2500, Lv 10 = 10 000.
export function levelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 0;
  return Math.floor(Math.sqrt(totalXp / XP_PER_MILESTONE));
}

export function xpForLevel(level: number): number {
  return level * level * XP_PER_MILESTONE;
}

export function levelProgress(totalXp: number) {
  const level = levelFromXp(totalXp);
  const xpAtLevel = xpForLevel(level);
  const xpAtNext = xpForLevel(level + 1);
  const xpInLevel = totalXp - xpAtLevel;
  const span = xpAtNext - xpAtLevel;
  return {
    level,
    totalXp,
    xpInLevel,
    xpToNext: xpAtNext - totalXp,
    xpNeededForLevel: span,
    progress: span > 0 ? xpInLevel / span : 0,
  };
}

/**
 * Curated library of common recurring quests the user can add in one click
 * from /quests. Categorised loosely so the UI can group them.
 *
 * Adding here is the lowest-friction way to extend the library — they're
 * not stored in the DB; the actual quest only exists once the user clicks
 * it (which calls `quest.create`).
 *
 * The "suggestedSkill" is a hint: the quest is created without a skill
 * link by default, but the UI surfaces the suggestion next to the button
 * so the user can pick one if they already have a matching Skill.
 */

export type QuestTemplate = {
  /** Stable id for React keys + dedupe. */
  id: string;
  title: string;
  description?: string;
  cadence: "daily" | "weekly";
  xpReward: number;
  suggestedSkill?: string;
  /** Loose grouping for UI tabs / sections. */
  group: "movement" | "study" | "wellbeing" | "household" | "creative";
  /** Emoji shown on the button — fast visual scan. */
  emoji: string;
};

export const QUEST_LIBRARY: QuestTemplate[] = [
  // ── Movement ─────────────────────────────────────────────────────────
  {
    id: "walk-10k",
    title: "Walk 10 000 steps",
    description: "Hit the daily step target",
    cadence: "daily",
    xpReward: 15,
    suggestedSkill: "Endurance",
    group: "movement",
    emoji: "🚶",
  },
  {
    id: "walk-15k",
    title: "Walk 15 000 steps",
    cadence: "daily",
    xpReward: 25,
    suggestedSkill: "Endurance",
    group: "movement",
    emoji: "🚶‍♂️",
  },
  {
    id: "run-5k",
    title: "Run 5 km",
    cadence: "daily",
    xpReward: 30,
    suggestedSkill: "Endurance",
    group: "movement",
    emoji: "🏃",
  },
  {
    id: "strength-session",
    title: "Strength-training session",
    description: "Hit the gym or do a home workout",
    cadence: "daily",
    xpReward: 20,
    suggestedSkill: "Strength",
    group: "movement",
    emoji: "🏋",
  },
  {
    id: "stretch",
    title: "Stretch / mobility (10 min)",
    cadence: "daily",
    xpReward: 5,
    suggestedSkill: "Strength",
    group: "movement",
    emoji: "🧘",
  },

  // ── Study ────────────────────────────────────────────────────────────
  {
    id: "read-10",
    title: "Read 10 pages",
    description: "Any book",
    cadence: "daily",
    xpReward: 10,
    group: "study",
    emoji: "📖",
  },
  {
    id: "lang-flashcards",
    title: "Language flashcards (20 min)",
    cadence: "daily",
    xpReward: 10,
    suggestedSkill: "Dutch",
    group: "study",
    emoji: "🗂",
  },
  {
    id: "lang-immersion",
    title: "Language immersion (TV / podcast, 30 min)",
    cadence: "daily",
    xpReward: 15,
    suggestedSkill: "Dutch",
    group: "study",
    emoji: "🎧",
  },
  {
    id: "code-30",
    title: "Code for 30 minutes",
    cadence: "daily",
    xpReward: 20,
    suggestedSkill: "Java",
    group: "study",
    emoji: "💻",
  },
  {
    id: "study-1h",
    title: "Study session (1 hour)",
    cadence: "daily",
    xpReward: 25,
    group: "study",
    emoji: "📚",
  },

  // ── Wellbeing ────────────────────────────────────────────────────────
  {
    id: "water-2l",
    title: "Drink 2 L of water",
    cadence: "daily",
    xpReward: 5,
    group: "wellbeing",
    emoji: "💧",
  },
  {
    id: "sleep-7h",
    title: "Sleep 7+ hours",
    cadence: "daily",
    xpReward: 10,
    group: "wellbeing",
    emoji: "😴",
  },
  {
    id: "meditate",
    title: "Meditate 10 minutes",
    cadence: "daily",
    xpReward: 10,
    group: "wellbeing",
    emoji: "🧠",
  },
  {
    id: "no-doomscroll",
    title: "No social-media doomscrolling",
    cadence: "daily",
    xpReward: 10,
    group: "wellbeing",
    emoji: "🚫",
  },
  {
    id: "outside-30",
    title: "30 minutes outside",
    cadence: "daily",
    xpReward: 5,
    group: "wellbeing",
    emoji: "🌳",
  },

  // ── Household ────────────────────────────────────────────────────────
  {
    id: "tidy-15",
    title: "Tidy up 15 minutes",
    cadence: "daily",
    xpReward: 5,
    group: "household",
    emoji: "🧹",
  },
  {
    id: "cook-home",
    title: "Cook a meal at home",
    cadence: "daily",
    xpReward: 10,
    group: "household",
    emoji: "🍳",
  },
  {
    id: "groceries",
    title: "Weekly groceries shop",
    cadence: "weekly",
    xpReward: 10,
    group: "household",
    emoji: "🛒",
  },
  {
    id: "deep-clean",
    title: "Deep clean one room",
    cadence: "weekly",
    xpReward: 25,
    group: "household",
    emoji: "🧽",
  },

  // ── Creative ─────────────────────────────────────────────────────────
  {
    id: "journal",
    title: "Journal entry",
    cadence: "daily",
    xpReward: 5,
    group: "creative",
    emoji: "✍",
  },
  {
    id: "side-project",
    title: "Side-project commit",
    description: "One meaningful push to a personal project",
    cadence: "daily",
    xpReward: 20,
    group: "creative",
    emoji: "🛠",
  },
  {
    id: "creative-30",
    title: "Creative session (draw / write / play, 30 min)",
    cadence: "daily",
    xpReward: 10,
    group: "creative",
    emoji: "🎨",
  },
];

export const QUEST_LIBRARY_GROUPS: Array<{
  key: QuestTemplate["group"];
  label: string;
  emoji: string;
}> = [
  { key: "movement", label: "Movement", emoji: "🏃" },
  { key: "study", label: "Study", emoji: "📚" },
  { key: "wellbeing", label: "Wellbeing", emoji: "🧠" },
  { key: "household", label: "Household", emoji: "🧹" },
  { key: "creative", label: "Creative", emoji: "🎨" },
];

import type { z } from "zod";
import { ProfileJson } from "./json-shapes";

// `z.input<…>` is the type BEFORE Zod applies defaults — lets us omit
// fields like `isCompleted: false`, `acquired: false`, and `position: 0`
// that the schema fills in automatically at parse time.
type ProfileJsonInput = z.input<typeof ProfileJson>;

/**
 * A FULL worked example Profile built from a real user's goal notes. It is
 * deliberately exhaustive — it exercises EVERY feature the importer supports:
 *
 *   - categories (with colour + icon)
 *   - skills (with description, targetDate, domain, and `requires` →
 *     Skill-Constellation prerequisite edges)
 *   - epics (status, targetDate, category) → milestones (tier = parallel
 *     work, position, estimatedStartDate + estimatedAchievementDate, linked
 *     skills) → steps (with dueDate + completed flags) + resources (book /
 *     video / note / tool / course, with url, notes, acquired)
 *   - quests: daily, weekly, and one-off side quests (with difficulty +
 *     expiresAt)
 *   - inventory: accounts (assets + liabilities), bills (monthly), goals
 *     (linked to an Epic, with progress + status)
 *   - preferences (work window for Steps → calendar time-blocks)
 *
 * Used by the Dashboard's "Watch an example JSON" button (pre-fills the import
 * dialog) AND as the structural template the local-AI serialize / fix pipeline
 * shows the model. Keeping it complete makes both jobs better.
 *
 * Editing notes:
 *   - Tiers are scoped to each Epic (same tier = parallel work).
 *   - Cross-epic prerequisites can't be expressed in this JSON, so gating is
 *     communicated via status: the in-flight exams Epic is `in_progress` and
 *     everything it blocks stays `not_started`.
 *   - Every skill name referenced by a milestone / quest / `requires` MUST
 *     appear in the top-level `skills` array, or the importer drops the link.
 */
export const EXAMPLE_PROFILE: ProfileJsonInput = {
  exportedAt: new Date().toISOString(),
  version: 1,

  // ── Categories ──────────────────────────────────────────────────────────
  categories: [
    { name: "Education", color: "#4a90e2", icon: "graduation-cap" },
    { name: "Career & Tech", color: "#f5a623", icon: "code" },
    { name: "Relocation", color: "#9013fe", icon: "plane" },
    { name: "Health & Fitness", color: "#7ed321", icon: "dumbbell" },
    { name: "Finance", color: "#f8e71c", icon: "coins" },
  ],

  // ── Skills (with domains + a few constellation prerequisites) ────────────
  skills: [
    {
      name: "Academic Mastery",
      description: "University exam preparation and knowledge",
      domain: "Mind",
      targetDate: "2026-07-12",
    },
    {
      name: "Software Engineering",
      description: "Programming — Java / Spring Boot and Vue 3",
      domain: "Tech",
    },
    {
      name: "Linguistics",
      description: "Dutch, English, and Japanese language acquisition",
      domain: "Language",
      targetDate: "2027-01-01",
    },
    {
      name: "CNC Machining",
      description: "Industrial manufacturing protocols and G-code",
      domain: "Trade",
    },
    {
      name: "Outsystems",
      description: "Low-code platform expertise",
      domain: "Tech",
      // To reach the platform certs, the general engineering base helps.
      requires: ["Software Engineering"],
    },
    { name: "Endurance", description: "Stamina built through walking and running", domain: "Body" },
    {
      name: "Physique",
      description: "Body composition and weight management",
      domain: "Body",
      requires: ["Endurance"],
    },
    {
      name: "Martial Arts",
      description: "Combat and discipline",
      domain: "Body",
      requires: ["Endurance"],
    },
    {
      name: "Financial Management",
      description: "Saving money and debt clearance",
      domain: "Finance",
    },
  ],

  // ── Epics → Milestones → Steps + Resources ───────────────────────────────
  epics: [
    {
      title: "Summer 2026 Exams",
      description:
        "Pass the immediate university exams. Timed top priority — gates everything else.",
      status: "in_progress",
      targetDate: "2026-07-12",
      category: "Education",
      milestones: [
        {
          title: "Prepare for Estadística",
          description: "Exam: 11 July 2026, 16:00–19:00. High priority.",
          status: "in_progress",
          tier: 0,
          estimatedStartDate: "2026-06-06",
          estimatedAchievementDate: "2026-07-11",
          skills: ["Academic Mastery"],
          steps: [
            { title: "Watch every class and take notes of the key ideas", isCompleted: true },
            { title: "Do every exercise of every unit", isCompleted: false },
            { title: "Sit a simulacrum exam", isCompleted: false, dueDate: "2026-07-09" },
          ],
          resources: [
            { kind: "note", label: "Exam slot: 11 Jul 2026, 16:00–19:00" },
          ],
        },
        {
          title: "Prepare for Fundamentos de los Computadores",
          description: "Exam: 12 July 2026, 11:00–14:00. High priority.",
          status: "in_progress",
          tier: 0,
          position: 1,
          estimatedStartDate: "2026-06-06",
          estimatedAchievementDate: "2026-07-12",
          skills: ["Academic Mastery"],
          steps: [
            { title: "Watch every class and take notes of the key ideas", isCompleted: true },
            { title: "Do every exercise of every unit", isCompleted: false },
            { title: "Sit a simulacrum exam", isCompleted: false, dueDate: "2026-07-10" },
          ],
          resources: [
            { kind: "note", label: "Exam slot: 12 Jul 2026, 11:00–14:00" },
          ],
        },
      ],
    },

    {
      title: "Pre-August Certification Sprint",
      description:
        "Optional pre-August sprint — stack quick certifications in this exact sequence.",
      status: "in_progress",
      targetDate: "2026-08-01",
      category: "Career & Tech",
      milestones: [
        {
          title: "OutSystems Web Developer Specialist",
          tier: 0,
          skills: ["Outsystems"],
          steps: [{ title: "Pass the certification exam", isCompleted: false }],
          resources: [
            {
              kind: "note",
              label: "Free exam voucher already available",
              acquired: true,
            },
          ],
        },
        { title: "OutSystems Mobile Developer Specialist", tier: 1, skills: ["Outsystems"], steps: [{ title: "Pass the certification exam" }] },
        { title: "OutSystems Front-End Developer Specialist", tier: 2, skills: ["Outsystems"], steps: [{ title: "Pass the certification exam" }] },
        { title: "GitHub Copilot Certification", tier: 3, skills: ["Software Engineering"], steps: [{ title: "Pass the certification exam" }] },
        { title: "GitHub Advanced Security Certification", tier: 4, skills: ["Software Engineering"], steps: [{ title: "Pass the certification exam" }] },
        { title: "GitHub Administration", tier: 5, skills: ["Software Engineering"], steps: [{ title: "Pass the certification exam" }] },
        { title: "GitHub Foundations", tier: 6, skills: ["Software Engineering"], steps: [{ title: "Pass the certification exam" }] },
        { title: "Microsoft Azure AI Fundamentals (AI-900)", tier: 7, steps: [{ title: "Pass the certification exam" }] },
        { title: "AWS Certified AI Practitioner", tier: 8, steps: [{ title: "Pass the certification exam" }] },
        { title: "Google Generative AI Leader", tier: 9, steps: [{ title: "Pass the certification exam" }] },
      ],
    },

    {
      title: "Build Mini-Git Version Control Project",
      description:
        "A cloud-based 'Mini-Git' for collaborative document version control using Vue 3, Spring Boot/Maven, PostgreSQL, AWS S3 and RabbitMQ.",
      status: "not_started",
      category: "Career & Tech",
      milestones: [
        {
          title: "Phase 0 — The Absolute Basics of Java",
          tier: 0,
          skills: ["Software Engineering"],
          steps: [{ title: "Watch a full Java course", isCompleted: false }],
          resources: [
            {
              kind: "video",
              label: "Full Java Course",
              url: "https://www.youtube.com/watch?v=eIrMbAQSU34",
              acquired: false,
            },
          ],
        },
        {
          title: "Phase 1 — Setting Up Your Workbench",
          tier: 1,
          skills: ["Software Engineering"],
          steps: [
            { title: "Install everything on the MacBook Pro M4 laptop" },
            { title: "Get familiar with IntelliJ IDEA Ultimate" },
          ],
        },
        {
          title: "Phase 2 — The Project Manager (Apache Maven)",
          tier: 2,
          skills: ["Software Engineering"],
          steps: [{ title: "Watch a Maven course" }],
        },
        {
          title: "Phase 3 — The Web Framework (Spring Boot)",
          tier: 3,
          skills: ["Software Engineering"],
          steps: [{ title: "Watch a Spring course" }],
        },
        {
          title: "Phase 4 — The File Upload (Your Mini-Git)",
          tier: 4,
          skills: ["Software Engineering"],
          steps: [{ title: "Start designing the app" }],
        },
      ],
    },

    {
      title: "Relocate to the Netherlands",
      description:
        "Change country from Spain to the Netherlands: language, CNC work prep, and funding.",
      status: "not_started",
      category: "Relocation",
      milestones: [
        {
          title: "Language & Mobility Basics",
          tier: 0,
          skills: ["Linguistics"],
          steps: [
            { title: "Learn Dutch to a CNaVT A2 level" },
            { title: "Get a C2 English certification from Cambridge", dueDate: "2026-12-01" },
            { title: "Get a driver's licence" },
          ],
          resources: [
            {
              kind: "course",
              label: "Autoescuela San Cristóbal",
              notes: "≈2 weeks, ≈1.200€ — do this when leaving the job.",
            },
          ],
        },
        {
          title: "Advanced Language",
          tier: 1,
          skills: ["Linguistics"],
          steps: [{ title: "Learn Dutch to a CNaVT B1 level" }],
        },
        {
          title: "Prepare for the CNC Work",
          description: "Runs in parallel with the language track.",
          tier: 0,
          position: 1,
          skills: ["CNC Machining"],
          steps: [
            { title: "Get VCA certification" },
            { title: "Learn the basics of G-code and M-code" },
            { title: "Learn how to read schematics" },
          ],
          resources: [
            { kind: "course", label: "VCA — Hercules Formación (A Coruña)", notes: "≈200€" },
            { kind: "video", label: "How to read schematics", url: "https://youtu.be/dw3CrHMtzMk" },
            {
              kind: "video",
              label: "G & M Code — Titan Teaches (playlist)",
              url: "https://www.youtube.com/playlist?list=PLCYbmsfgztnGmIygQckBvbvcolqDxfMY_",
            },
            { kind: "tool", label: "NC Viewer", url: "https://ncviewer.com" },
          ],
        },
        {
          title: "Financial Foundation",
          description: "Runs in parallel — clear debts before the move.",
          tier: 0,
          position: 2,
          skills: ["Financial Management"],
          steps: [{ title: "Pay off all of my debts" }],
        },
      ],
    },

    {
      title: "Outsystems Expert Certification",
      description: "Complete the full OutSystems certification path.",
      status: "not_started",
      category: "Career & Tech",
      milestones: [
        { title: "Web Specialist", tier: 0, skills: ["Outsystems"], steps: [{ title: "Get Web Specialist" }] },
        { title: "Agentic AI", tier: 1, skills: ["Outsystems"], steps: [{ title: "Get Agentic AI" }] },
        { title: "Architecture Specialist", tier: 2, skills: ["Outsystems"], steps: [{ title: "Get Architecture Specialist" }] },
        { title: "Tech Lead", tier: 3, skills: ["Outsystems"], steps: [{ title: "Get Tech Lead" }] },
        { title: "Professional Platform Ops Engineer (O11)", tier: 4, skills: ["Outsystems"], steps: [{ title: "Get Platform Ops Engineer" }] },
        { title: "Professional DevOps Engineer (O11)", tier: 5, skills: ["Outsystems"], steps: [{ title: "Get DevOps Engineer" }] },
      ],
    },

    {
      title: "Move to Japan (Backup Plan)",
      description:
        "Alternative relocation — requires Japanese fluency and higher education.",
      status: "not_started",
      category: "Relocation",
      milestones: [
        { title: "JLPT N5", tier: 0, skills: ["Linguistics"], steps: [{ title: "Learn Japanese to an N5 level" }] },
        { title: "JLPT N4", tier: 1, skills: ["Linguistics"], steps: [{ title: "Learn Japanese to an N4 level" }] },
        { title: "JLPT N3", tier: 2, skills: ["Linguistics"], steps: [{ title: "Learn Japanese to an N3 level" }] },
      ],
    },

    {
      title: "Finish University Studies",
      description: "Complete the engineering degree and a master's.",
      status: "not_started",
      category: "Education",
      milestones: [
        { title: "First Year Clearance", tier: 0, skills: ["Academic Mastery"], steps: [{ title: "Finish all first-year subjects" }] },
        { title: "Second Year Clearance", tier: 1, skills: ["Academic Mastery"], steps: [{ title: "Finish all second-year subjects" }] },
        { title: "Third Year Clearance", tier: 2, skills: ["Academic Mastery"], steps: [{ title: "Finish all third-year subjects" }] },
        { title: "Fourth Year Clearance", tier: 3, skills: ["Academic Mastery"], steps: [{ title: "Finish all fourth-year subjects" }] },
        { title: "Final Projects", tier: 4, skills: ["Academic Mastery"], steps: [{ title: "Do the final projects" }] },
        {
          title: "Master's Degree",
          tier: 5,
          skills: ["Academic Mastery"],
          steps: [
            { title: "Decide which master's to do" },
            { title: "Decide where to study it" },
          ],
        },
      ],
    },

    {
      title: "Achieve Peak Physical Fitness",
      description: "Recompose the body, complete endurance races, and earn a black belt.",
      status: "not_started",
      category: "Health & Fitness",
      milestones: [
        {
          title: "Aesthetic Body — Cutting Phase",
          tier: 0,
          skills: ["Physique"],
          steps: [
            { title: "Get to 90 kg on the cut" },
            { title: "Get to 85 kg on the cut" },
            { title: "Get to 80 kg on the cut" },
          ],
        },
        {
          title: "Aesthetic Body — Lean Bulk Phase",
          tier: 1,
          skills: ["Physique"],
          steps: [
            { title: "Get to 85 kg without gaining fat" },
            { title: "Get to 90 kg without gaining fat" },
          ],
        },
        {
          title: "Aesthetic Body — Final Shred",
          tier: 2,
          skills: ["Physique"],
          steps: [{ title: "Get to 14% body fat" }],
        },
        {
          title: "Marathon — Walking Phase",
          description: "Runs in parallel with the body-composition track.",
          tier: 0,
          position: 1,
          skills: ["Endurance"],
          steps: [
            { title: "Walk 10k steps every day for a month" },
            { title: "Walk 15k steps every day for a month" },
          ],
        },
        {
          title: "Marathon — Running Phase",
          tier: 1,
          position: 1,
          skills: ["Endurance"],
          steps: [
            { title: "Run 5 km every day for a month" },
            { title: "Run 10 km every day for a month" },
          ],
        },
        {
          title: "Marathon — Races",
          tier: 2,
          position: 1,
          skills: ["Endurance"],
          steps: [
            { title: "Run a half marathon" },
            { title: "Run a full marathon" },
          ],
        },
        {
          title: "Martial Arts",
          description: "Runs in parallel — discipline + combat.",
          tier: 0,
          position: 2,
          skills: ["Martial Arts"],
          steps: [
            { title: "Decide on a discipline from the options" },
            { title: "Earn a black belt" },
          ],
        },
      ],
    },
  ],

  // ── Quests: daily habits, weekly habits, and one-off side quests ─────────
  quests: [
    { title: "Walk 10k steps", cadence: "daily", xpReward: 10, skill: "Endurance", difficulty: "trivial" },
    { title: "Walk 15k steps", cadence: "daily", xpReward: 15, skill: "Endurance", difficulty: "normal" },
    { title: "Run 5 kilometers", cadence: "daily", xpReward: 25, skill: "Endurance", difficulty: "normal" },
    { title: "Run 10 kilometers", cadence: "daily", xpReward: 50, skill: "Endurance", difficulty: "hard" },
    { title: "Journal the day", description: "Document events, process thoughts, protect mental health.", cadence: "daily", xpReward: 10, difficulty: "trivial" },
    { title: "Deep work 08:00–18:00", description: "Hold the professional focus window.", cadence: "daily", xpReward: 20, skill: "Software Engineering" },
    { title: "Complete 4 workout sessions", cadence: "weekly", xpReward: 40, skill: "Physique", difficulty: "hard" },
    { title: "Exam study block (Fri + weekend)", cadence: "weekly", xpReward: 30, skill: "Academic Mastery" },
    {
      title: "Declutter & sell unneeded possessions",
      description: "Minimalist transition — free up space and capital.",
      cadence: "one_off",
      xpReward: 40,
      difficulty: "hard",
      expiresAt: "2026-09-01T00:00:00.000Z",
    },
    {
      title: "Pay off the rest of a financed purchase",
      cadence: "one_off",
      xpReward: 25,
      skill: "Financial Management",
      difficulty: "normal",
    },
  ],

  // ── Inventory: accounts (assets + liabilities) ───────────────────────────
  // Sample/demo figures only — replace with your own in the app.
  accounts: [
    {
      name: "Main Checking",
      kind: "asset",
      category: "checking",
      balanceCents: 200000,
      currency: "EUR",
      notes: "Salary deposited the last Friday of each month.",
    },
    { name: "Savings", kind: "asset", category: "savings", balanceCents: 100000, currency: "EUR" },
    {
      name: "Consumer Loan",
      kind: "liability",
      category: "loan",
      balanceCents: 150000,
      currency: "EUR",
      notes: "Auto-debited on the 6th of each month.",
    },
    {
      name: "Personal Loan (family)",
      kind: "liability",
      category: "family",
      balanceCents: 600000,
      currency: "EUR",
      notes: "No rush to repay.",
    },
  ],

  // ── Inventory: recurring bills ───────────────────────────────────────────
  bills: [
    { name: "Gym membership", amountCents: 4500, currency: "EUR", cadence: "monthly", category: "fitness", nextDueDate: "2026-07-01" },
    { name: "Streaming subscription", amountCents: 800, currency: "EUR", cadence: "monthly", category: "subscriptions", nextDueDate: "2026-07-01" },
    { name: "Groceries", amountCents: 30000, currency: "EUR", cadence: "monthly", category: "food", nextDueDate: "2026-07-01" },
    { name: "Leisure budget", amountCents: 10000, currency: "EUR", cadence: "monthly", category: "leisure", nextDueDate: "2026-07-01" },
    { name: "Loan installment", amountCents: 11500, currency: "EUR", cadence: "monthly", category: "loan", nextDueDate: "2026-07-06" },
  ],

  // ── Inventory: financial goals (some linked to an Epic) ──────────────────
  goals: [
    { name: "Move Fund — Phase 1", targetCents: 100000, currentCents: 100000, currency: "EUR", targetDate: "2026-09-01", epic: "Relocate to the Netherlands", status: "achieved", notes: "First slice of the relocation fund." },
    { name: "Move Fund — Phase 2", targetCents: 200000, currentCents: 50000, currency: "EUR", epic: "Relocate to the Netherlands", status: "active" },
    { name: "Move Fund — Phase 3", targetCents: 500000, currentCents: 0, currency: "EUR", epic: "Relocate to the Netherlands", status: "active" },
    { name: "Move Fund — Final", targetCents: 1000000, currentCents: 0, currency: "EUR", epic: "Relocate to the Netherlands", status: "active" },
    { name: "Clear consumer loan", targetCents: 150000, currentCents: 0, currency: "EUR", status: "active", notes: "Debt-free milestone." },
    { name: "Driver's licence fund", targetCents: 200000, currentCents: 0, currency: "EUR", status: "active" },
    { name: "Cambridge C2 exam fund", targetCents: 25000, currentCents: 0, currency: "EUR", status: "active" },
  ],

  // ── Preferences: work window drives Steps → calendar time-blocks ─────────
  preferences: {
    workWindowStart: "08:00",
    workWindowEnd: "18:00",
    workWindowDays: "1111100", // Mon–Fri
    defaultStepDurationMin: 45,
  },
};

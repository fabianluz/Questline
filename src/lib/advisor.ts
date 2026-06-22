import "server-only";
import { z } from "zod";
import { and, asc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { Message, Tool, ToolCall } from "ollama";
import {
  getActiveModel,
  describeOllamaError,
  getOllama,
  unloadActiveModel,
} from "./ollama";
import { db } from "@/server/db";
import {
  calendarBlock,
  epic,
  milestone,
  quest,
  resource,
  scheduleProfile,
  skill,
  skillPrerequisite,
  userPreference,
} from "@/server/db/schema";
import { planSkillLinks } from "./skill-graph";
import { extractJson } from "./extract-json";
import { numCtxForPrompt } from "./context-window";
import { resolveWindow } from "./schedule";
import type { AdvisorEvent, MilestoneProposal } from "./advisor-types";

export type { MilestoneProposal } from "./advisor-types";

// ============================================================================
// Context export (no AI call — pure formatter)
// ============================================================================

/**
 * Compact "Schedule" context: today's resolved work window + active profiles +
 * upcoming time-off, so AI planners (break-down, day plan, Ask the Guide)
 * respect summer/regular hours and holidays instead of guessing.
 */
async function buildScheduleContext(userId: string): Promise<string[]> {
  const [profiles, blocks, prefs] = await Promise.all([
    db.query.scheduleProfile.findMany({ where: eq(scheduleProfile.userId, userId) }),
    db.query.calendarBlock.findMany({ where: eq(calendarBlock.userId, userId) }),
    db.query.userPreference.findFirst({
      where: eq(userPreference.userId, userId),
      columns: { workWindowStart: true, workWindowEnd: true, workWindowDays: true },
    }),
  ]);
  if (profiles.length === 0 && blocks.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const win = resolveWindow(today, {
    profiles: profiles.map((p) => ({
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      days: p.days,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo,
      priority: p.priority,
      active: p.active,
    })),
    blocks: blocks.map((b) => ({
      title: b.title,
      startDate: b.startDate,
      endDate: b.endDate,
      blocksWork: b.blocksWork,
    })),
    fallback: prefs
      ? { startTime: prefs.workWindowStart, endTime: prefs.workWindowEnd, days: prefs.workWindowDays }
      : null,
  });

  const lines: string[] = ["## Schedule", ""];
  lines.push(
    win.working
      ? `- **Today (${today}):** working ${win.start}–${win.end}${win.label ? ` · ${win.label}` : ""}`
      : `- **Today (${today}):** no work${win.label ? ` · ${win.label}` : ""}`,
  );
  const active = profiles.filter((p) => p.active);
  if (active.length > 0) {
    lines.push("- **Schedule profiles:**");
    for (const p of active) {
      const range =
        p.effectiveFrom || p.effectiveTo
          ? ` [${p.effectiveFrom ?? "…"} → ${p.effectiveTo ?? "…"}]`
          : " [always]";
      lines.push(`  - ${p.name}: ${p.startTime}–${p.endTime}${range}`);
    }
  }
  const upcoming = blocks
    .filter((b) => b.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 8);
  if (upcoming.length > 0) {
    lines.push("- **Upcoming time blocks:**");
    for (const b of upcoming) {
      lines.push(
        `  - ${b.title} (${b.kind}) ${b.startDate}→${b.endDate}${b.blocksWork ? " · no work" : ""}`,
      );
    }
  }
  lines.push("");
  return lines;
}

/**
 * Build a structured markdown snapshot of the user's full roadmap, ready to
 * paste into any external LLM as context. Brief §4 "Context Generation".
 */
export async function formatRoadmapAsMarkdown(userId: string): Promise<string> {
  const epics = await db.query.epic.findMany({
    where: eq(epic.userId, userId),
    with: {
      category: true,
      milestones: {
        with: { steps: true, resources: true, skills: { with: { skill: true } } },
      },
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  if (epics.length === 0) {
    const sched = await buildScheduleContext(userId);
    return ["# Roadmap", "", "_No epics yet._", "", ...sched].join("\n");
  }

  const lines: string[] = ["# Roadmap", ""];
  const now = new Date().toISOString().slice(0, 10);
  lines.push(`_Exported ${now}_`, "");

  for (const e of epics) {
    lines.push(
      `## ${e.title}${e.category ? ` (${e.category.name})` : ""}`,
      "",
    );
    if (e.description) lines.push(e.description, "");
    lines.push(`- **Status:** ${e.status.replace("_", " ")}`);
    if (e.targetDate) lines.push(`- **Target date:** ${e.targetDate}`);
    lines.push("");

    if (e.milestones.length === 0) {
      lines.push("_No milestones._", "");
      continue;
    }

    const byTier = new Map<number, typeof e.milestones>();
    for (const m of [...e.milestones].sort(
      (a, b) => a.tier - b.tier || a.position - b.position,
    )) {
      const arr = byTier.get(m.tier) ?? [];
      arr.push(m);
      byTier.set(m.tier, arr);
    }

    for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
      const ms = byTier.get(tier)!;
      lines.push(
        `### Tier ${tier}${ms.length > 1 ? " _(parallel)_" : ""}`,
        "",
      );
      for (const m of ms) {
        const done = m.status === "completed" ? "✓" : "·";
        const dateBit = m.estimatedAchievementDate
          ? m.estimatedStartDate
            ? ` (${m.estimatedStartDate} → ${m.estimatedAchievementDate})`
            : ` (target ${m.estimatedAchievementDate})`
          : "";
        lines.push(`- ${done} **${m.title}**${dateBit}`);
        if (m.description) lines.push(`  - ${m.description}`);
        if (m.steps.length > 0) {
          const doneCount = m.steps.filter((s) => s.isCompleted).length;
          lines.push(`  - Steps: ${doneCount}/${m.steps.length} complete`);
          for (const s of m.steps) {
            lines.push(`    - ${s.isCompleted ? "[x]" : "[ ]"} ${s.title}`);
          }
        }
        if (m.resources.length > 0) {
          lines.push("  - Resources:");
          for (const r of m.resources) {
            const acquired = r.acquired ? "✓" : "·";
            const link = r.url ? ` — ${r.url}` : "";
            lines.push(`    - ${acquired} (${r.kind}) ${r.label}${link}`);
          }
        }
        if (m.skills.length > 0) {
          const names = m.skills.map((s) => s.skill.name).join(", ");
          lines.push(`  - Skills: ${names}`);
        }
      }
      lines.push("");
    }
  }

  lines.push(...(await buildScheduleContext(userId)));

  return lines.join("\n");
}

// ============================================================================
// Break Down Epic — local LLM tool-use loop via Ollama
// ============================================================================

export type BreakDownEpicResult = {
  proposals: MilestoneProposal[];
  summary: string;
  model: string;
  iterations: number;
};

// Kept short and explicit — small local models follow tight instructions
// better than open-ended ones.
const ADVISOR_SYSTEM_PROMPT = `You are "The Guide" — an in-game advisor in a JRPG-styled life-management app.

The user organizes life goals as:
- Epic: long-term priority (e.g. "Master Japanese", spans months)
- Milestone: a checkpoint inside an Epic (e.g. "Pass N5 Level")
- Tier: integer 0,1,2... Same tier = parallel work, higher tier = later in the journey

Your only job: propose 3-5 NEW milestones for the Epic the user shows you, using the propose_milestone tool ONCE per proposal.

Rules:
- Call propose_milestone for EACH proposal, separately. Do not bundle.
- Title must be concrete and measurable ("Pass N5 Level", not "Get started")
- Tier should sit AFTER the user's highest existing tier — extend the journey, don't repeat it
- One-sentence description of what "done" looks like
- Don't duplicate existing milestones
- Don't propose generic items ("Stay consistent", "Make a plan")

After your tool calls, write one sentence summarizing the path you proposed.`;

const proposalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  tier: z.number().int().min(0).max(20),
  estimatedStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  estimatedAchievementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const PROPOSE_MILESTONE_TOOL: Tool = {
  type: "function",
  function: {
    name: "propose_milestone",
    description:
      "Propose ONE new milestone for the Epic. Call this once per proposal.",
    parameters: {
      type: "object",
      required: ["title", "tier"],
      properties: {
        title: {
          type: "string",
          description:
            "Concrete, measurable title (e.g. 'Pass N5 Level', not 'Get started')",
        },
        description: {
          type: "string",
          description: "One sentence on what completion looks like",
        },
        tier: {
          type: "number",
          description:
            "Tier in the progression — same tier = parallel, higher = later",
        },
        estimatedStartDate: {
          type: "string",
          description:
            "ISO date YYYY-MM-DD when work should begin, if appropriate",
        },
        estimatedAchievementDate: {
          type: "string",
          description: "ISO date YYYY-MM-DD target completion, if appropriate",
        },
      },
    },
  },
};

const MAX_ITERATIONS = 6;

export async function breakDownEpic(
  userId: string,
  epicId: string,
): Promise<BreakDownEpicResult> {
  const target = await db.query.epic.findFirst({
    where: eq(epic.id, epicId),
    with: {
      category: true,
      milestones: { with: { steps: true } },
    },
  });
  if (!target || target.userId !== userId) {
    throw new Error("Epic not found");
  }

  const existingMd = formatExistingMilestonesForPrompt(target.milestones);
  const userMessage = `Epic: ${target.title}${target.category ? ` (${target.category.name})` : ""}
${target.description ? `\nDescription: ${target.description}` : ""}
${target.targetDate ? `Target date: ${target.targetDate}` : "No target date set."}

Existing milestones:
${existingMd}

Propose 3-5 NEW milestones (at tier ${nextSuggestedTier(target.milestones)}+) to extend this Epic.`;

  const messages: Message[] = [
    { role: "system", content: ADVISOR_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const proposals: MilestoneProposal[] = [];
  const ollama = getOllama();
  let iterations = 0;
  let lastText = "";

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    let response;
    try {
      response = await ollama.chat({
        model: getActiveModel(),
        messages,
        tools: [PROPOSE_MILESTONE_TOOL],
        stream: false,
        options: { temperature: 0.6 },
      });
    } catch (err) {
      throw new Error(describeOllamaError(err, getActiveModel()));
    }

    const assistantMsg = response.message;
    if (assistantMsg.content) lastText = assistantMsg.content;
    messages.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) break;

    // Execute each tool call. We don't actually mutate the DB here — we just
    // collect the proposal and return a confirmation so the model knows it
    // was recorded.
    for (const call of toolCalls) {
      if (call.function.name !== "propose_milestone") {
        messages.push({
          role: "tool",
          content: `Unknown tool: ${call.function.name}`,
        });
        continue;
      }
      const parsed = proposalSchema.safeParse(call.function.arguments);
      if (!parsed.success) {
        messages.push({
          role: "tool",
          content: `Invalid arguments: ${parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}. Please call again with valid fields.`,
        });
        continue;
      }
      // De-duplicate: skip if we've already proposed this exact title at this tier
      if (
        proposals.some(
          (p) => p.title === parsed.data.title && p.tier === parsed.data.tier,
        )
      ) {
        messages.push({
          role: "tool",
          content: `Skipped: "${parsed.data.title}" at tier ${parsed.data.tier} is a duplicate.`,
        });
        continue;
      }
      proposals.push(parsed.data);
      messages.push({
        role: "tool",
        content: `Recorded: "${parsed.data.title}" at tier ${parsed.data.tier}. ${proposals.length} total so far.`,
      });
    }
  }

  return {
    proposals,
    summary:
      lastText.trim() ||
      (proposals.length > 0
        ? `Proposed ${proposals.length} new milestones.`
        : "(no proposals)"),
    model: getActiveModel(),
    iterations,
  };
}

function nextSuggestedTier(
  milestones: Array<{ tier: number }>,
): number {
  if (milestones.length === 0) return 0;
  return Math.max(...milestones.map((m) => m.tier)) + 1;
}

// ============================================================================
// Streaming variant — emits events as proposals + tokens arrive
// ============================================================================

/**
 * Streaming sibling of breakDownEpic. Same prompt/tool loop, but yields
 * events to a callback as they arrive from Ollama:
 *  - `start` once at the beginning
 *  - `token` for each chunk of summary text
 *  - `proposal` each time a tool call passes validation
 *  - `tool_skipped` if a tool call is invalid/duplicate
 *  - `done` with stats when finished
 *  - `error` if Ollama itself errors
 *
 * The caller (an SSE route handler) is responsible for shipping events to
 * the client.
 */
export async function breakDownEpicStream(
  userId: string,
  epicId: string,
  emit: (event: AdvisorEvent) => void,
): Promise<void> {
  const target = await db.query.epic.findFirst({
    where: eq(epic.id, epicId),
    with: {
      category: true,
      milestones: { with: { steps: true } },
    },
  });
  if (!target || target.userId !== userId) {
    emit({ type: "error", message: "Epic not found" });
    return;
  }

  emit({
    type: "start",
    model: getActiveModel(),
    existingMilestones: target.milestones.length,
  });

  const existingMd = formatExistingMilestonesForPrompt(target.milestones);
  const userMessage = `Epic: ${target.title}${target.category ? ` (${target.category.name})` : ""}
${target.description ? `\nDescription: ${target.description}` : ""}
${target.targetDate ? `Target date: ${target.targetDate}` : "No target date set."}

Existing milestones:
${existingMd}

Propose 3-5 NEW milestones (at tier ${nextSuggestedTier(target.milestones)}+) to extend this Epic.`;

  const messages: Message[] = [
    { role: "system", content: ADVISOR_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const proposals: MilestoneProposal[] = [];
  const ollama = getOllama();
  const startTime = Date.now();
  let iterations = 0;
  let proposalIndex = 0;
  let promptTokens = 0;
  let responseTokens = 0;
  // Fit the existing-milestones context so it isn't truncated to the 2048 default.
  const numCtx = numCtxForPrompt(messages.map((m) => m.content ?? ""));

  while (iterations < MAX_ITERATIONS) {
    iterations += 1;
    let assistantContent = "";
    const assistantToolCalls: ToolCall[] = [];

    try {
      const stream = await ollama.chat({
        model: getActiveModel(),
        messages,
        tools: [PROPOSE_MILESTONE_TOOL],
        stream: true,
        options: { temperature: 0.6, num_ctx: numCtx },
      });

      for await (const chunk of stream) {
        const chunkContent = chunk.message.content;
        if (chunkContent) {
          assistantContent += chunkContent;
          emit({ type: "token", text: chunkContent });
        }
        if (chunk.message.tool_calls?.length) {
          assistantToolCalls.push(...chunk.message.tool_calls);
        }
        if (chunk.done) {
          promptTokens += chunk.prompt_eval_count ?? 0;
          responseTokens += chunk.eval_count ?? 0;
        }
      }
    } catch (err) {
      emit({ type: "error", message: describeOllamaError(err, getActiveModel()) });
      return;
    }

    messages.push({
      role: "assistant",
      content: assistantContent,
      ...(assistantToolCalls.length > 0
        ? { tool_calls: assistantToolCalls }
        : {}),
    });

    if (assistantToolCalls.length === 0) break;

    for (const call of assistantToolCalls) {
      if (call.function.name !== "propose_milestone") {
        const reason = `Unknown tool: ${call.function.name}`;
        emit({ type: "tool_skipped", reason });
        messages.push({ role: "tool", content: reason });
        continue;
      }
      const parsed = proposalSchema.safeParse(call.function.arguments);
      if (!parsed.success) {
        const reason = `Invalid arguments: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`;
        emit({ type: "tool_skipped", reason });
        messages.push({
          role: "tool",
          content: `${reason}. Please call again with valid fields.`,
        });
        continue;
      }
      const proposal = parsed.data;
      if (
        proposals.some(
          (p) => p.title === proposal.title && p.tier === proposal.tier,
        )
      ) {
        const reason = `Duplicate: "${proposal.title}" at tier ${proposal.tier}`;
        emit({ type: "tool_skipped", reason });
        messages.push({ role: "tool", content: `Skipped: ${reason}.` });
        continue;
      }
      proposals.push(proposal);
      emit({ type: "proposal", proposal, index: proposalIndex });
      proposalIndex += 1;
      messages.push({
        role: "tool",
        content: `Recorded: "${proposal.title}" at tier ${proposal.tier}. ${proposals.length} so far.`,
      });
    }
  }

  emit({
    type: "done",
    iterations,
    durationMs: Date.now() - startTime,
    promptTokens,
    responseTokens,
    proposals: proposals.length,
  });
}

// Keep the prompt bounded for giant epics — the highest tiers matter most
// for "what's next", so we keep those and elide the foundational rest.
const MAX_EXISTING_IN_PROMPT = 30;

function formatExistingMilestonesForPrompt(
  milestones: Array<{
    title: string;
    tier: number;
    status: string;
    description: string | null;
  }>,
): string {
  if (milestones.length === 0) return "_(none — this is a fresh epic)_";

  const total = milestones.length;
  // Sort by tier ascending so the rendered list reads chronologically, but
  // if we have to truncate, drop from the FRONT (oldest/foundational tiers)
  // because the highest tiers are what the next proposals should extend.
  const sorted = [...milestones].sort((a, b) => a.tier - b.tier);
  const kept =
    total <= MAX_EXISTING_IN_PROMPT
      ? sorted
      : sorted.slice(total - MAX_EXISTING_IN_PROMPT);

  const lines = kept.map(
    (m) =>
      `- Tier ${m.tier} · ${m.title} [${m.status}]${m.description ? ` — ${m.description}` : ""}`,
  );

  if (total > MAX_EXISTING_IN_PROMPT) {
    const elided = total - MAX_EXISTING_IN_PROMPT;
    const lowestKeptTier = kept[0].tier;
    lines.unshift(
      `_(${elided} earlier milestone${elided === 1 ? "" : "s"} at tiers < ${lowestKeptTier} not shown)_`,
    );
  }

  return lines.join("\n");
}

// ============================================================================
// Accept proposals → bulk insert milestones
// ============================================================================

import type { MilestoneAIProvenance } from "@/server/db/schema/goals";

// ============================================================================
// §4 — Schedule adjustment suggestions
// ============================================================================

export type ScheduleSuggestion = {
  milestoneId: string;
  milestoneTitle: string;
  currentDate: string | null;
  suggestedDate: string;
  reason: string;
};

const ADJUST_TOOL: Tool = {
  type: "function",
  function: {
    name: "adjust_milestone_date",
    description:
      "Suggest a new target date for a milestone that looks overloaded or under-paced.",
    parameters: {
      type: "object",
      required: ["milestoneId", "suggestedDate", "reason"],
      properties: {
        milestoneId: { type: "string", description: "The milestone UUID" },
        suggestedDate: {
          type: "string",
          description: "ISO YYYY-MM-DD",
        },
        reason: {
          type: "string",
          description: "One sentence explaining the adjustment",
        },
      },
    },
  },
};

export async function suggestScheduleAdjustments(
  userId: string,
): Promise<{ suggestions: ScheduleSuggestion[]; model: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await db
    .select({
      id: milestone.id,
      title: milestone.title,
      date: milestone.estimatedAchievementDate,
      epicTitle: epic.title,
      status: milestone.status,
    })
    .from(milestone)
    .innerJoin(epic, eq(milestone.epicId, epic.id))
    .where(
      and(
        eq(epic.userId, userId),
        isNotNull(milestone.estimatedAchievementDate),
        gte(milestone.estimatedAchievementDate, today),
      ),
    )
    .orderBy(asc(milestone.estimatedAchievementDate))
    .limit(30);

  if (upcoming.length === 0) {
    return { suggestions: [], model: getActiveModel() };
  }

  const userMessage = `Review this upcoming milestone schedule and call adjust_milestone_date for any items that look overloaded (3+ deadlines in the same week) or unrealistic (high effort with <7 days).

Today: ${today}
Upcoming milestones:
${upcoming.map((m) => `- ${m.id} | ${m.date} | ${m.title} (${m.epicTitle}) [${m.status}]`).join("\n")}

Only call the tool for milestones that genuinely need rescheduling. Skip items that look fine. After your tool calls, write one summary sentence.`;

  const ollama = getOllama();
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are 'The Guide', a JRPG-styled life advisor. Help the user pace their roadmap realistically.",
    },
    { role: "user", content: userMessage },
  ];
  const out: ScheduleSuggestion[] = [];

  for (let iter = 0; iter < 3; iter++) {
    let response;
    try {
      response = await ollama.chat({
        model: getActiveModel(),
        messages,
        tools: [ADJUST_TOOL],
        stream: false,
        options: { temperature: 0.3 },
      });
    } catch (err) {
      throw new Error(describeOllamaError(err, getActiveModel()));
    }
    messages.push(response.message);
    const calls = response.message.tool_calls ?? [];
    if (calls.length === 0) break;
    for (const call of calls) {
      const args = call.function.arguments as {
        milestoneId?: string;
        suggestedDate?: string;
        reason?: string;
      };
      const target = upcoming.find((u) => u.id === args.milestoneId);
      if (
        !target ||
        !args.suggestedDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(args.suggestedDate)
      ) {
        messages.push({ role: "tool", content: "Invalid args; skipped." });
        continue;
      }
      out.push({
        milestoneId: target.id,
        milestoneTitle: target.title,
        currentDate: target.date,
        suggestedDate: args.suggestedDate,
        reason: args.reason ?? "Rebalanced",
      });
      messages.push({ role: "tool", content: "Recorded." });
    }
  }

  return { suggestions: out, model: getActiveModel() };
}

// ============================================================================
// §4 — Resource recommendations
// ============================================================================

export type ResourceRecommendation = {
  kind: string;
  label: string;
  url?: string;
  notes?: string;
};

const RECOMMEND_TOOL: Tool = {
  type: "function",
  function: {
    name: "recommend_resource",
    description:
      "Recommend ONE study resource (book, course, tool, video) for the milestone.",
    parameters: {
      type: "object",
      required: ["kind", "label"],
      properties: {
        kind: {
          type: "string",
          description: "book | course | video | tool | article | other",
        },
        label: { type: "string", description: "Title or short name" },
        url: { type: "string", description: "Optional URL" },
        notes: { type: "string", description: "Why this one, one sentence" },
      },
    },
  },
};

export async function recommendResources(
  userId: string,
  milestoneId: string,
): Promise<{ recommendations: ResourceRecommendation[]; model: string }> {
  const m = await db.query.milestone.findFirst({
    where: eq(milestone.id, milestoneId),
    with: { epic: true, resources: true },
  });
  if (!m || m.epic.userId !== userId) throw new Error("Milestone not found");

  const existing = m.resources.map((r) => `- (${r.kind}) ${r.label}`).join("\n");
  const userMessage = `Recommend 3-5 high-quality resources to help reach this milestone.
Avoid duplicating items already attached.

Milestone: ${m.title}
Description: ${m.description ?? "(none)"}
Inside Epic: ${m.epic.title}
Existing resources:
${existing || "(none)"}`;

  const ollama = getOllama();
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are 'The Guide'. Recommend concrete resources by calling recommend_resource once per recommendation.",
    },
    { role: "user", content: userMessage },
  ];
  const out: ResourceRecommendation[] = [];

  for (let iter = 0; iter < 4; iter++) {
    let response;
    try {
      response = await ollama.chat({
        model: getActiveModel(),
        messages,
        tools: [RECOMMEND_TOOL],
        stream: false,
        options: { temperature: 0.6 },
      });
    } catch (err) {
      throw new Error(describeOllamaError(err, getActiveModel()));
    }
    messages.push(response.message);
    const calls = response.message.tool_calls ?? [];
    if (calls.length === 0) break;
    for (const call of calls) {
      const args = call.function.arguments as Partial<ResourceRecommendation>;
      if (!args.kind || !args.label) {
        messages.push({ role: "tool", content: "Missing kind or label." });
        continue;
      }
      if (out.some((r) => r.label === args.label)) {
        messages.push({ role: "tool", content: "Duplicate; skip." });
        continue;
      }
      out.push({
        kind: args.kind,
        label: args.label,
        url: args.url,
        notes: args.notes,
      });
      messages.push({ role: "tool", content: "Recorded." });
    }
  }
  return { recommendations: out, model: getActiveModel() };
}

export async function acceptResourceRecommendations(
  userId: string,
  milestoneId: string,
  picked: ResourceRecommendation[],
): Promise<{ created: number }> {
  const m = await db.query.milestone.findFirst({
    where: eq(milestone.id, milestoneId),
    with: { epic: true },
  });
  if (!m || m.epic.userId !== userId) throw new Error("Milestone not found");
  if (picked.length === 0) return { created: 0 };
  await db.insert(resource).values(
    picked.map((p) => ({
      milestoneId,
      kind: p.kind,
      label: p.label,
      url: p.url ?? null,
      notes: p.notes ?? null,
    })),
  );
  return { created: picked.length };
}

// ============================================================================
// §7 — Side-quest generator
// ============================================================================

export type SideQuestSuggestion = {
  title: string;
  description?: string;
  difficulty: "trivial" | "normal" | "hard";
  xpReward: number;
};

const SIDEQUEST_TOOL: Tool = {
  type: "function",
  function: {
    name: "propose_side_quest",
    description:
      "Propose ONE spontaneous side quest unrelated to long-term Epics. Call once per quest.",
    parameters: {
      type: "object",
      required: ["title", "difficulty"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        difficulty: { type: "string", enum: ["trivial", "normal", "hard"] },
      },
    },
  },
};

export async function generateSideQuests(
  userId: string,
  count: number = 3,
): Promise<{ proposals: SideQuestSuggestion[]; model: string }> {
  const userEpics = await db.query.epic.findMany({
    where: eq(epic.userId, userId),
    columns: { title: true },
    limit: 10,
  });
  const ctx = userEpics.map((e) => `- ${e.title}`).join("\n") || "(none yet)";
  const userMessage = `Propose ${count} fresh, low-stakes side quests the user could finish in a day or two. They should be unrelated to long-term grind. Mix difficulty.

The user's long-term epics (for flavor, don't repeat them):
${ctx}`;

  const ollama = getOllama();
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are 'The Guide'. Generate small, motivating one-off side quests via the propose_side_quest tool.",
    },
    { role: "user", content: userMessage },
  ];
  const out: SideQuestSuggestion[] = [];

  for (let iter = 0; iter < 3; iter++) {
    let response;
    try {
      response = await ollama.chat({
        model: getActiveModel(),
        messages,
        tools: [SIDEQUEST_TOOL],
        stream: false,
        options: { temperature: 0.9 },
      });
    } catch (err) {
      throw new Error(describeOllamaError(err, getActiveModel()));
    }
    messages.push(response.message);
    const calls = response.message.tool_calls ?? [];
    if (calls.length === 0) break;
    for (const call of calls) {
      const args = call.function.arguments as Partial<SideQuestSuggestion>;
      const difficulty = args.difficulty ?? "normal";
      if (!args.title) {
        messages.push({ role: "tool", content: "Missing title." });
        continue;
      }
      if (out.some((q) => q.title === args.title)) {
        messages.push({ role: "tool", content: "Duplicate." });
        continue;
      }
      const xpReward =
        difficulty === "trivial" ? 5 : difficulty === "hard" ? 40 : 15;
      out.push({
        title: args.title,
        description: args.description,
        difficulty: difficulty as "trivial" | "normal" | "hard",
        xpReward,
      });
      messages.push({ role: "tool", content: "Recorded." });
      if (out.length >= count) break;
    }
    if (out.length >= count) break;
  }
  return { proposals: out, model: getActiveModel() };
}

// ============================================================================
// §10 — Save Point retrospective draft
// ============================================================================

export async function draftRetrospective(input: {
  questsCompleted: number;
  milestonesCompleted: number;
  xpGained: number;
  topSkill: string | null;
}): Promise<{
  wentWell: string;
  struggled: string;
  nextWeekFocus: string;
  model: string;
}> {
  const ollama = getOllama();
  const userMessage = `Draft a short weekly retrospective for the user from these stats:
- Quests completed: ${input.questsCompleted}
- Milestones completed: ${input.milestonesCompleted}
- XP gained: ${input.xpGained}
- Top skill: ${input.topSkill ?? "none"}

Return EXACTLY three labeled sections, each 1-2 sentences:
WENT_WELL:
...
STRUGGLED:
...
NEXT_WEEK_FOCUS:
...`;

  const model = getActiveModel();
  let text = "";
  try {
    const response = await ollama.chat({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are 'The Guide'. Speak warmly and concretely; no platitudes. Output plain text only — no markdown bold or headings.",
        },
        { role: "user", content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.7 },
      // One-shot retrospective: free the model right after (see weeklyCoach).
      keep_alive: 0,
    });
    text = response.message.content ?? "";
  } catch (err) {
    throw new Error(describeOllamaError(err, model));
  } finally {
    void unloadActiveModel(model);
  }

  const s = extractLabeledSections(text, [
    "WENT_WELL",
    "STRUGGLED",
    "NEXT_WEEK_FOCUS",
  ]);
  return {
    wentWell: s.WENT_WELL,
    struggled: s.STRUGGLED,
    nextWeekFocus: s.NEXT_WEEK_FOCUS,
    model,
  };
}

// ============================================================================
// Weekly Coach — a short local briefing over the user's live roadmap
// ============================================================================

/**
 * Build a concise weekly briefing from the user's current epics, milestones,
 * deadlines and quests. Runs fully locally on the warm Ollama model. Returns
 * three labeled sections the dashboard card renders.
 */
export async function weeklyCoach(userId: string): Promise<{
  priorities: string;
  risks: string;
  encouragement: string;
  generatedAt: string;
  model: string;
}> {
  const todayStr = new Date().toISOString().slice(0, 10);

  const epics = await db.query.epic.findMany({
    where: eq(epic.userId, userId),
    with: {
      milestones: {
        columns: { title: true, status: true, estimatedAchievementDate: true },
      },
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  const activeEpics = epics.filter(
    (e) => e.status !== "completed" && e.status !== "abandoned",
  );
  const openMs = activeEpics.flatMap((e) =>
    e.milestones
      .filter((m) => m.status !== "completed" && m.status !== "abandoned")
      .map((m) => ({ epic: e.title, ...m })),
  );
  const overdue = openMs.filter(
    (m) => m.estimatedAchievementDate && m.estimatedAchievementDate < todayStr,
  );
  const soon = openMs
    .filter((m) => m.estimatedAchievementDate && m.estimatedAchievementDate >= todayStr)
    .sort((a, b) =>
      a.estimatedAchievementDate!.localeCompare(b.estimatedAchievementDate!),
    )
    .slice(0, 8);
  const undated = openMs.filter((m) => !m.estimatedAchievementDate).slice(0, 8);

  const quests = await db.query.quest.findMany({
    where: and(eq(quest.userId, userId), eq(quest.archived, false)),
    columns: { title: true, cadence: true },
  });

  if (activeEpics.length === 0 && quests.length === 0) {
    return {
      priorities: "",
      risks: "",
      encouragement:
        "Add an Epic or a Quest and I'll have a proper briefing for you next time.",
      generatedAt: new Date().toISOString(),
      model: getActiveModel(),
    };
  }

  const lines: string[] = [`Today: ${todayStr}`];
  lines.push(
    `Active epics (${activeEpics.length}): ${activeEpics.map((e) => e.title).join("; ")}`,
  );
  if (overdue.length)
    lines.push(
      `OVERDUE milestones: ${overdue.map((m) => `${m.title} (${m.epic}, due ${m.estimatedAchievementDate})`).join("; ")}`,
    );
  if (soon.length)
    lines.push(
      `Upcoming milestones: ${soon.map((m) => `${m.title} (${m.epic}, ${m.estimatedAchievementDate})`).join("; ")}`,
    );
  if (undated.length)
    lines.push(
      `Open milestones without dates: ${undated.map((m) => `${m.title} (${m.epic})`).join("; ")}`,
    );
  if (quests.length)
    lines.push(`Daily/side quests: ${quests.map((q) => q.title).join("; ")}`);

  const userMessage = `Here is the player's current roadmap state:
${lines.join("\n")}

Write a SHORT weekly briefing with EXACTLY these three labeled sections, each
header on its own line in plain text (no markdown, no "#", no "**"):

PRIORITIES:
- 2-4 bullets naming the most important milestones/quests to push this week, each with one concrete first action.

RISKS:
- 1-3 bullets about overdue or at-risk items (or a single bullet "Nothing urgent." if none).

ENCOURAGEMENT:
One warm sentence (no bullet).

Rules: start each bullet with "- ". Do NOT wrap the section headers in asterisks
or markdown. Do NOT add any text before PRIORITIES or after the encouragement.`;

  const model = getActiveModel();
  const ollama = getOllama();
  let text = "";
  try {
    const response = await ollama.chat({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are 'The Guide', a wise JRPG mentor. Be concrete and brief; no platitudes. Reference the user's actual epics and milestones by name. Output plain text only — never markdown bold, italics, or headings.",
        },
        { role: "user", content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.6 },
      // One-shot briefing: unload the model the moment it finishes so a heavy
      // model (e.g. a 30B) doesn't sit pinned in RAM for the default ~5 min.
      keep_alive: 0,
    });
    text = response.message.content ?? "";
  } catch (err) {
    throw new Error(describeOllamaError(err, model));
  } finally {
    // Belt-and-suspenders: if the engine ignored keep_alive, evict explicitly.
    void unloadActiveModel(model);
  }

  const sections = extractLabeledSections(text, [
    "PRIORITIES",
    "RISKS",
    "ENCOURAGEMENT",
  ]);
  return {
    priorities: sections.PRIORITIES,
    risks: sections.RISKS,
    encouragement: sections.ENCOURAGEMENT,
    generatedAt: new Date().toISOString(),
    model,
  };
}

/**
 * Split a labeled briefing into the requested sections, tolerant of how small
 * local models actually format output: markdown-bold headers (`**RISKS:**`),
 * heading markers (`### Risks`), bullet glyphs (`*`, `•`, `-`), and stray empty
 * bullets. The old regex assumed bare `LABEL:` lines and silently dumped the
 * whole blob into the first section when a model wrapped the headers in `**…**`.
 * Labels are matched case-insensitively; the returned keys are the labels
 * exactly as passed in. Content lines are stripped of markdown + list markers.
 */
function extractLabeledSections(
  text: string,
  labels: string[],
): Record<string, string> {
  const buckets = new Map<string, string[]>(labels.map((l) => [l, []]));
  const byUpper = new Map(labels.map((l) => [l.toUpperCase(), l]));
  // Strip markdown emphasis/code so headers and content read as plain text.
  const stripMd = (s: string) =>
    s.replace(/\*\*/g, "").replace(/[`_]/g, "").trim();
  // Remove a single leading list marker (-, *, •) plus following space.
  const stripBullet = (s: string) => s.replace(/^[-*•]\s+/, "").trim();
  const labelAlt = labels
    .map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const headerRe = new RegExp(`^(${labelAlt})\\b\\s*:?\\s*(.*)$`, "i");

  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripMd(raw);
    if (!line) continue;
    // A header line is (optionally bulleted/##) then a known label + ":".
    const bare = line.replace(/^[#>\s]*[-*•]?\s*/, "");
    const header = bare.match(headerRe);
    if (header) {
      current = byUpper.get(header[1].toUpperCase()) ?? null;
      const rest = stripBullet(header[2]);
      if (current && rest && /[a-z0-9]/i.test(rest))
        buckets.get(current)!.push(rest);
      continue;
    }
    if (!current) continue;
    const content = stripBullet(line);
    // Drop marker-only / empty lines (e.g. a stray "*").
    if (content && /[a-z0-9]/i.test(content)) buckets.get(current)!.push(content);
  }

  const out: Record<string, string> = {};
  for (const l of labels) out[l] = (buckets.get(l) ?? []).join("\n");
  return out;
}

// ============================================================================
// Daily Journal — arrange a day's timeline + draft a reflection
// ============================================================================

export type PlannedBlock = {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  title: string;
  kind: string;
  source: string;
};

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Deterministic fallback planner — used if Ollama is down or returns garbage.
 * Keeps fixed blocks where they are and stacks flexible items into the gaps
 * between them within the waking window.
 */
function fallbackPlan(input: PlanDayInput): PlannedBlock[] {
  const fixed = [...input.fixed]
    .filter((b) => HHMM_RE.test(b.start) && HHMM_RE.test(b.end))
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((b) => ({ ...b, source: "template" as const }));
  const blocks: PlannedBlock[] = fixed.map((b) => ({
    start: b.start,
    end: b.end,
    title: b.label,
    kind: b.kind,
    source: "template",
  }));

  // Find free gaps inside the waking window (default 08:00–23:00).
  const dayStart = toMin(input.wakeHHMM ?? "08:00");
  const dayEnd = toMin(input.sleepHHMM ?? "23:00");
  const busy = fixed
    .map((b) => [toMin(b.start), toMin(b.end)] as const)
    .sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cursor = dayStart;
  for (const [s, e] of busy) {
    if (s > cursor) gaps.push([cursor, Math.min(s, dayEnd)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) gaps.push([cursor, dayEnd]);

  const flexible = input.flexible.slice();
  let gi = 0;
  let gStart = gaps[0]?.[0] ?? dayEnd;
  for (const item of flexible) {
    const dur = item.minutes ?? 45;
    while (gi < gaps.length && gStart + dur > gaps[gi][1]) {
      gi += 1;
      gStart = gaps[gi]?.[0] ?? dayEnd;
    }
    if (gi >= gaps.length) break;
    blocks.push({
      start: toHHMM(gStart),
      end: toHHMM(gStart + dur),
      title: item.title,
      kind: item.kind,
      source: item.kind === "quest" ? "quest" : "step",
    });
    gStart += dur;
  }
  return blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
}

export type PlanDayInput = {
  dateLabel: string;
  wakeHHMM?: string;
  sleepHHMM?: string;
  fixed: { label: string; start: string; end: string; kind: string }[];
  flexible: { title: string; kind: "quest" | "step"; minutes?: number }[];
  external: { summary: string; start: string; end: string }[];
};

/**
 * Arrange a full 00–24 day plan: fixed blocks stay put, flexible quests/steps
 * fill the gaps, and the model may add a few "suggestion" fillers for empty
 * time. Always returns a usable plan (falls back to a deterministic layout).
 */
export async function planDay(
  input: PlanDayInput,
): Promise<{ blocks: PlannedBlock[]; model: string }> {
  const fixedLines = input.fixed
    .map((b) => `- [FIXED ${b.start}-${b.end}] ${b.label} (${b.kind})`)
    .join("\n");
  const externalLines = input.external
    .map((e) => `- [EVENT ${e.start}-${e.end}] ${e.summary}`)
    .join("\n");
  const flexLines = input.flexible
    .map((f) => `- ${f.title} (${f.kind}, ~${f.minutes ?? 45} min)`)
    .join("\n");

  const userMessage = `Plan my day for ${input.dateLabel}. Waking window ~${input.wakeHHMM ?? "08:00"}–${input.sleepHHMM ?? "23:00"}.

FIXED blocks (keep exactly at their times, do not move):
${fixedLines || "(none)"}

Calendar EVENTS (also fixed):
${externalLines || "(none)"}

FLEXIBLE items to place into the free gaps (don't overlap fixed blocks/breaks):
${flexLines || "(none)"}

Produce a clean, non-overlapping timeline covering the day. Place every fixed block and event, fit the flexible items into gaps, and you MAY add a few short "suggestion" blocks for otherwise-empty time (rest, review, meals, wind-down).

Return ONLY JSON: {"blocks":[{"start":"HH:MM","end":"HH:MM","title":"...","kind":"work|break|fixed|flex|quest|step|event|suggestion"}]}. Times are 24h. Blocks must be sorted and must not overlap.`;

  let parsed: PlannedBlock[] | null = null;
  try {
    const ollama = getOllama();
    const response = await ollama.chat({
      model: getActiveModel(),
      messages: [
        {
          role: "system",
          content:
            "You are a precise daily-schedule planner. Output strict JSON only. Never move FIXED blocks. Never create overlaps.",
        },
        { role: "user", content: userMessage },
      ],
      stream: false,
      format: "json",
      options: { temperature: 0.4 },
    });
    const raw = JSON.parse(response.message.content || "{}");
    const arr = Array.isArray(raw) ? raw : raw.blocks;
    if (Array.isArray(arr)) {
      parsed = arr
        .filter(
          (b) =>
            b &&
            typeof b.start === "string" &&
            typeof b.end === "string" &&
            typeof b.title === "string" &&
            HHMM_RE.test(b.start) &&
            HHMM_RE.test(b.end) &&
            toMin(b.end) > toMin(b.start),
        )
        .map((b) => ({
          start: b.start,
          end: b.end,
          title: String(b.title).slice(0, 200),
          kind: typeof b.kind === "string" ? b.kind : "flex",
          source:
            typeof b.kind === "string" && b.kind === "suggestion"
              ? "ai"
              : "ai",
        }))
        .sort((a, b) => toMin(a.start) - toMin(b.start));
    }
  } catch {
    parsed = null;
  }

  const blocks = parsed && parsed.length > 0 ? parsed : fallbackPlan(input);
  return { blocks, model: getActiveModel() };
}

/** Draft a markdown daily-journal summary from the (optionally checked-off) plan. */
export async function draftDayJournal(input: {
  dateLabel: string;
  blocks: { start: string; end: string; title: string; kind: string; done?: boolean }[];
}): Promise<{ text: string; model: string }> {
  const lines = input.blocks
    .map(
      (b) =>
        `- ${b.start}-${b.end} ${b.title}${b.done ? " ✓ done" : ""} (${b.kind})`,
    )
    .join("\n");
  const userMessage = `Here is how my day (${input.dateLabel}) was scheduled, with ✓ marking what I actually completed:
${lines || "(empty day)"}

Write a short markdown Daily Journal I can paste into Obsidian. Use these exact headings and keep each to 1–4 concise bullet points:

## ${input.dateLabel}

### Went well
### Friction
### Tomorrow

Be specific and reference the blocks/tasks by name. Warm, honest, no platitudes.`;

  let text = "";
  try {
    const ollama = getOllama();
    const response = await ollama.chat({
      model: getActiveModel(),
      messages: [
        {
          role: "system",
          content:
            "You are 'The Guide', a wise, concrete journaling companion. Output GitHub-flavored markdown only.",
        },
        { role: "user", content: userMessage },
      ],
      stream: false,
      options: { temperature: 0.7 },
    });
    text = response.message.content ?? "";
  } catch (err) {
    throw new Error(describeOllamaError(err, getActiveModel()));
  }
  return { text: text.trim(), model: getActiveModel() };
}

// ============================================================================
// Ask the Guide — conversational AI grounded in the user's own data
// ============================================================================

/**
 * Stream a chat reply from 'The Guide', injecting a markdown snapshot of the
 * user's whole roadmap as context so answers reference their real epics,
 * milestones, quests and finances. 100% local (Ollama).
 */
export async function chatWithGuideStream(
  userId: string,
  messages: { role: "user" | "assistant"; content: string }[],
  emit: (event: AiStreamEvent) => void,
): Promise<void> {
  emit({ type: "start", model: getActiveModel() });

  let context = "";
  try {
    context = await formatRoadmapAsMarkdown(userId);
  } catch {
    context = "(no roadmap data available)";
  }

  const system = `You are "The Guide", the user's personal strategist inside Questline — a local, gamified life-management app. Answer using ONLY the user's actual data provided below. Be concrete and concise; reference their real Epics, Milestones, Quests and finances by name. When asked what to focus on, prioritize overdue and imminent items, and respect dependencies. If the data doesn't contain an answer, say so plainly rather than inventing it.

=== USER ROADMAP CONTEXT ===
${context}`;

  const started = Date.now();
  try {
    const ollama = getOllama();
    // Size the context window to fit the whole roadmap + conversation, so the
    // model isn't truncated to Ollama's 2048-token default.
    const numCtx = numCtxForPrompt([system, ...messages.map((m) => m.content)]);
    const stream = await ollama.chat({
      model: getActiveModel(),
      messages: [{ role: "system", content: system }, ...messages],
      stream: true,
      options: { temperature: 0.5, num_ctx: numCtx },
    });
    let promptTokens = 0;
    let responseTokens = 0;
    for await (const part of stream) {
      const t = part.message?.content ?? "";
      if (t) {
        responseTokens += 1;
        emit({ type: "token", text: t });
      }
      if (part.done) {
        promptTokens = part.prompt_eval_count ?? 0;
        responseTokens = part.eval_count ?? responseTokens;
      }
    }
    emit({
      type: "done",
      model: getActiveModel(),
      promptTokens,
      responseTokens,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    emit({ type: "error", message: describeOllamaError(err, getActiveModel()) });
  }
}

// ============================================================================
// Local AI pipeline — Notes → Structured → JSON (streaming)
//
// These two functions wrap the same prompts that ship in lib/tutorial-prompts
// (HELP_PROMPT_RESTRUCTURE + HELP_PROMPT_JSON) so the in-app local AI
// pipeline produces identical output to the manual two-prompt workflow
// the Tutorial page documents.
//
// Both stream tokens via a callback the SSE route forwards to the client.
// Neither uses tool-calling — these prompts ask for plain markdown / JSON
// text, so the response is a straight content stream.
// ============================================================================

export type AiStreamEvent =
  | { type: "start"; model: string }
  | { type: "token"; text: string }
  | {
      type: "done";
      model: string;
      promptTokens: number;
      responseTokens: number;
      durationMs: number;
    }
  | { type: "error"; message: string };

/**
 * Step 1: raw notes → structured Questline-vocabulary markdown.
 * Uses the exact same prompt the Tutorial page exposes for external LLMs,
 * so behavior matches the documented manual flow.
 */
export async function notesToStructuredStream(
  rawNotes: string,
  emit: (event: AiStreamEvent) => void,
): Promise<void> {
  const { HELP_PROMPT_RESTRUCTURE } = await import("./tutorial-prompts");
  await runPromptStream(
    HELP_PROMPT_RESTRUCTURE + "\n\n" + rawNotes,
    /* temperature */ 0.5,
    emit,
  );
}

/**
 * Step 2: structured markdown → ProfileJson.
 * The prompt instructs the model to emit ONLY the JSON (no fences),
 * so the streamed text can be `JSON.parse`d directly once `done` fires.
 */
export async function structuredToJsonStream(
  structured: string,
  emit: (event: AiStreamEvent) => void,
): Promise<void> {
  const { HELP_PROMPT_JSON } = await import("./tutorial-prompts");
  await runPromptStream(
    HELP_PROMPT_JSON + "\n\n" + structured,
    /* temperature */ 0.2, // tighter for structural fidelity
    emit,
    { json: true },
  );
}

/**
 * Step 2.5 (recoverable error path): bad JSON + Zod validation errors →
 * corrected JSON. The prompt embeds three things:
 *
 *   1. The full HELP_PROMPT_JSON ruleset (so the model has the schema)
 *   2. The known-good EXAMPLE_PROFILE as a structural template
 *   3. The user's bad JSON + the Zod errors verbatim
 *
 * Output is a single corrected JSON object (no fences, no commentary —
 * same contract as `structuredToJsonStream`).
 *
 * Temperature stays tight (0.15) because we want surgical fixes, not
 * creative restructuring. The user already approved the structured input
 * upstream, so the JSON shape should be close to correct.
 */
export async function fixProfileJsonStream(
  badJson: string,
  errorSummary: string,
  emit: (event: AiStreamEvent) => void,
): Promise<void> {
  const { HELP_PROMPT_JSON } = await import("./tutorial-prompts");
  const { EXAMPLE_PROFILE } = await import("./example-profile");

  const fixPrompt = `${HELP_PROMPT_JSON}

==========================================================================
EXISTING VALID EXAMPLE (use as structural template — copy its field
shapes / types / nesting / enum values exactly):
==========================================================================
\`\`\`json
${JSON.stringify(EXAMPLE_PROFILE, null, 2)}
\`\`\`

==========================================================================
YOUR PREVIOUS OUTPUT (which I tried to import — see the validation
errors below it):
==========================================================================
${badJson}

==========================================================================
ZOD VALIDATION ERRORS reported when I tried to import that JSON
(format: \`path.to.field → reason\`):
==========================================================================
${errorSummary}

==========================================================================
TASK
==========================================================================
Emit a SINGLE CORRECTED JSON object that:
  - resolves every validation error above
  - keeps every user-meaningful field (titles, dates, descriptions) from
    the previous output that wasn't the source of an error
  - copies field SHAPES / TYPES / ENUMS from the example template
  - does NOT add commentary, markdown fences, or any text outside the
    JSON object itself
`;

  await runPromptStream(fixPrompt, /* temperature */ 0.15, emit, { json: true });
}

async function runPromptStream(
  fullPrompt: string,
  temperature: number,
  emit: (event: AiStreamEvent) => void,
  opts: { json?: boolean } = {},
): Promise<void> {
  emit({ type: "start", model: getActiveModel() });
  const ollama = getOllama();
  const startTime = Date.now();
  let promptTokens = 0;
  let responseTokens = 0;
  try {
    const stream = await ollama.chat({
      model: getActiveModel(),
      messages: [
        // No system prompt — the user prompt itself sets the rules.
        // The structured prompts are explicit enough that a separate
        // system message would just add noise.
        { role: "user", content: fullPrompt },
      ],
      stream: true,
      // `format: "json"` constrains the model to emit a single valid JSON
      // value — no ```json fences, no preamble, no trailing commentary. This
      // is the reliable cure for models that keep wrapping output in fences.
      ...(opts.json ? { format: "json" as const } : {}),
      options: { temperature },
    });
    for await (const chunk of stream) {
      const content = chunk.message?.content;
      if (content) emit({ type: "token", text: content });
      if (chunk.done) {
        promptTokens += chunk.prompt_eval_count ?? 0;
        responseTokens += chunk.eval_count ?? 0;
      }
    }
    emit({
      type: "done",
      model: getActiveModel(),
      promptTokens,
      responseTokens,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    emit({
      type: "error",
      message: describeOllamaError(err, getActiveModel()),
    });
  }
}

// ============================================================================
// Chapter board planner — propose a starter chapter layout from the user's
// existing Epics / Milestones / Quests.
//
// Two tools, used in two phases:
//
//   Phase 1 (answers === undefined):
//     - The model may call `ask_question` 1–3 times to clarify focus before
//       committing to a plan. If it doesn't ask anything, it falls through to
//       Phase 2 in the same call.
//
//   Phase 2 (answers provided OR model skipped questions):
//     - The model calls `propose_chapter` one or more times. Each call
//       provides a chapter title + the nodes (by entity id from the supplied
//       context) and their tier within that chapter.
//
// Returns either { kind: "questions", questions: [...] } or
//          { kind: "plan", chapters: [...] }.
// ============================================================================

export type PlanChapterQuestion = {
  id: string;
  text: string;
  /** "free" = open text. "choice" = one of the listed options. */
  kind: "free" | "choice";
  choices?: string[];
};

export type PlanChapterNode = {
  kind: "epic" | "milestone" | "quest";
  refId: string;
  tier: number;
  notes?: string;
};

export type PlanChapterChapter = {
  title: string;
  color?: string;
  notes?: string;
  nodes: PlanChapterNode[];
};

export type PlanChapterResult =
  | { kind: "questions"; questions: PlanChapterQuestion[]; model: string }
  | { kind: "plan"; chapters: PlanChapterChapter[]; model: string };

// The local model references backlog items by short CODES (E1 / M3 / Q2)
// shown in the prompt — not raw UUIDs, which small models routinely mangle.
// We map codes back to real ids server-side. The model emits ONE JSON object
// (`format: "json"`), so there's no flaky tool-calling to fail.

const planQuestionSchema = z.object({
  text: z.string().min(3).max(300),
  kind: z.enum(["free", "choice"]),
  choices: z.array(z.string().min(1).max(80)).max(6).optional(),
});

/** Shape the model returns for Phase 1 (clarifying questions). */
const planQuestionsJsonSchema = z.object({
  questions: z.array(planQuestionSchema).min(1),
});

/** Shape the model returns for Phase 2 (the chapter plan). */
const planChaptersJsonSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        notes: z.string().max(300).optional(),
        nodes: z
          .array(
            z.object({
              ref: z.string().min(1).max(12),
              tier: z.number().int().min(0).max(20).optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const PLAN_QUESTION_SYSTEM_PROMPT = `You are "The Guide" in a JRPG-styled life-management app.

Before laying out the user's CHAPTER BOARD, ask 3-5 SHORT, high-signal clarifying questions whose answers will materially change how you sequence their goals. Good topics: their single top priority right now, preferred pace (deep focus on one thing vs. parallel progress), hard deadlines, weekly time budget, and how many chapters (phases) they want.

Keep each question concrete and quick to answer; offer choices when natural. Write questions in plain language about the user's goals — NEVER mention the internal item codes (E1, M2, Q3, …) in the question text or choices. Do NOT propose any plan yet — questions only.

Return ONE JSON object, no prose, no markdown fences:
{ "questions": [ { "text": "…?", "kind": "free" }, { "text": "…?", "kind": "choice", "choices": ["A","B","C"] } ] }
Use "choices" ONLY when "kind" is "choice".`;

const PLAN_CHAPTER_SYSTEM_PROMPT = `You are "The Guide" — an in-game advisor in a JRPG-styled life-management app.

The user has a backlog of Epics (long-term goals), Milestones (concrete sub-goals inside an Epic), and Quests (recurring habits). Each item is shown with a short CODE: E# for epics, M# for milestones, Q# for quests.

Your job: lay out a CHAPTER BOARD — an ordered list of chapters that sequences the user's journey. Each chapter is a phase (e.g. "Chapter 1: Foundations", "Chapter 2: Push"). Within a chapter, tier 0 = do first, higher tier = later, same tier = parallel.

KEY IDEA — a big Epic usually SPANS several chapters. Represent its progression by placing DIFFERENT MILESTONES of that Epic in different chapters. Example: for an Epic "Relocate to the Netherlands", put milestone "Learn Dutch A1" in Chapter 1 and "Learn Dutch A2" in Chapter 2. Prefer placing concrete Milestones over the bare Epic whenever milestones exist. You MAY place several different Epics' milestones in the SAME chapter (parallel progress).

Return ONE JSON object, no prose, no markdown fences, in EXACTLY this shape:
{
  "chapters": [
    {
      "title": "Chapter 1: Foundations",
      "color": "#5b2a86",
      "notes": "One sentence on the theme.",
      "nodes": [ { "ref": "E1", "tier": 0 }, { "ref": "M3", "tier": 1 } ]
    }
  ]
}

Rules:
  - Make 2-5 chapters. Each chapter holds 1-6 cards.
  - "ref" MUST be one of the exact codes (E#, M#, Q#) listed in the prompt. Never invent codes.
  - "tier" is a small integer (0 = first within the chapter). "color"/"notes" are optional.
  - Place each Milestone and Quest in just ONE chapter. (An Epic may recur across chapters, but prefer its milestones to show progression.)
  - Earlier chapters = foundations / prerequisites; later chapters = advanced / ambitious.
  - HONOR the user's answers about focus, pace, deadlines, and number of chapters.`;

/** How many times to retry plan generation if the model yields 0 chapters. */
const PLAN_GENERATION_ATTEMPTS = 3;
/** Always surface at least this many clarifying questions to the user. */
const PLAN_MIN_QUESTIONS = 3;
/** Never overwhelm the user with more than this many. */
const PLAN_MAX_QUESTIONS = 5;

/**
 * Fallback questions used to TOP UP the model's questions to the minimum.
 * Generic but genuinely useful for sequencing — chosen so the answers map
 * cleanly onto chapter count / pace / priority.
 */
const DEFAULT_PLAN_QUESTIONS: Array<Omit<PlanChapterQuestion, "id">> = [
  {
    text: "What is the single most important goal to make progress on first?",
    kind: "free",
  },
  {
    text: "How many chapters (phases) do you want to split your journey into?",
    kind: "choice",
    choices: ["2", "3", "4", "5"],
  },
  {
    text: "Do you prefer deep focus on one goal at a time, or parallel progress across several?",
    kind: "choice",
    choices: ["One at a time", "A few in parallel", "Everything at once"],
  },
  {
    text: "Any hard deadlines I should respect (an exam, a move, a contract date)?",
    kind: "free",
  },
  {
    text: "Roughly how many hours per week can you commit?",
    kind: "choice",
    choices: ["< 5", "5–10", "10–20", "20+"],
  },
];

type PlanRef = { kind: "epic" | "milestone" | "quest"; id: string };

type PlanContext = {
  hasBacklog: boolean;
  backlogText: string;
  /** Short code (E1 / M3 / Q2, upper-case) → the real entity it resolves to. */
  codeMap: Map<string, PlanRef>;
};

/**
 * Pull the user's backlog into a prompt-ready snapshot. Each entity gets a
 * short CODE (E#, M#, Q#) the model echoes back — far more reliable than
 * asking a small model to copy UUIDs verbatim. `codeMap` resolves the codes
 * back to real ids server-side.
 */
async function gatherPlanContext(userId: string): Promise<PlanContext> {
  const [epics, milestones, quests] = await Promise.all([
    db.query.epic.findMany({
      where: eq(epic.userId, userId),
      with: { category: { columns: { name: true } } },
      columns: { id: true, title: true, status: true, targetDate: true },
      orderBy: [asc(epic.createdAt)],
    }),
    db.query.milestone.findMany({
      with: { epic: { columns: { title: true, userId: true } } },
      columns: {
        id: true,
        title: true,
        status: true,
        tier: true,
        estimatedStartDate: true,
        estimatedAchievementDate: true,
      },
      orderBy: [asc(milestone.tier)],
    }),
    db.query.quest.findMany({
      where: and(eq(quest.userId, userId), eq(quest.archived, false)),
      columns: { id: true, title: true, cadence: true },
      orderBy: [asc(quest.createdAt)],
    }),
  ]);
  const userMilestones = milestones.filter((m) => m.epic.userId === userId);

  const codeMap = new Map<string, PlanRef>();

  const epicLines = epics.map((e, i) => {
    const code = `E${i + 1}`;
    codeMap.set(code, { kind: "epic", id: e.id });
    return `- ${code}: "${e.title}"${e.category ? ` (${e.category.name})` : ""} [${e.status}]${e.targetDate ? ` — target ${e.targetDate}` : ""}`;
  });
  const milestoneLines = userMilestones.map((m, i) => {
    const code = `M${i + 1}`;
    codeMap.set(code, { kind: "milestone", id: m.id });
    return `- ${code}: "${m.title}" (in "${m.epic.title}", tier ${m.tier}) [${m.status}]${m.estimatedAchievementDate ? (m.estimatedStartDate ? ` — ${m.estimatedStartDate} → ${m.estimatedAchievementDate}` : ` — target ${m.estimatedAchievementDate}`) : ""}`;
  });
  const questLines = quests.map((q, i) => {
    const code = `Q${i + 1}`;
    codeMap.set(code, { kind: "quest", id: q.id });
    return `- ${code}: "${q.title}" (${q.cadence})`;
  });

  const backlogText = `Here is the user's current backlog. Reference items by their CODE (the E#/M#/Q# prefix).

EPICS:
${epicLines.length > 0 ? epicLines.join("\n") : "(none)"}

MILESTONES:
${milestoneLines.length > 0 ? milestoneLines.join("\n") : "(none)"}

QUESTS:
${questLines.length > 0 ? questLines.join("\n") : "(none)"}`;

  return {
    hasBacklog: epics.length + userMilestones.length + quests.length > 0,
    backlogText,
    codeMap,
  };
}

/**
 * Single non-streaming JSON chat. Uses `format: "json"` so Ollama emits one
 * valid JSON value (no fences/preamble) and returns the raw content string.
 * Throws (with a friendly message) only on a transport error so "Ollama down"
 * surfaces; callers handle parse/shape failures themselves.
 */
async function runJsonChatText(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
): Promise<string> {
  const ollama = getOllama();
  try {
    const response = await ollama.chat({
      model: getActiveModel(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      format: "json",
      stream: false,
      options: { temperature },
    });
    return response.message?.content ?? "";
  } catch (err) {
    throw new Error(describeOllamaError(err, getActiveModel()));
  }
}

/**
 * Phase 1 — generate clarifying questions. Asks the model for 3-5 questions,
 * then TOPS UP with curated defaults so the user always sees at least
 * PLAN_MIN_QUESTIONS. Transport errors propagate (so "Ollama down" surfaces
 * properly); a weak/empty model response just falls back to defaults.
 */
async function generatePlanQuestions(
  ctx: PlanContext,
): Promise<PlanChapterQuestion[]> {
  const questions: PlanChapterQuestion[] = [];
  const seen = new Set<string>();

  // Ask the model for questions as one JSON object. Any failure (transport,
  // bad JSON, weak shape) just falls through to the curated defaults below —
  // the questions step must never hard-fail, since the plan step (Phase 2)
  // will surface a real "Ollama down" error if the model is unreachable.
  try {
    const text = await runJsonChatText(
      PLAN_QUESTION_SYSTEM_PROMPT,
      `${ctx.backlogText}\n\nAsk ${PLAN_MIN_QUESTIONS}-${PLAN_MAX_QUESTIONS} clarifying questions now. Questions only — no plan yet.`,
      0.5,
    );
    const parsed = planQuestionsJsonSchema.safeParse(
      JSON.parse(extractJson(text)),
    );
    if (parsed.success) {
      for (const q of parsed.data.questions) {
        const norm = q.text.trim().toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        questions.push({
          id: `q-${questions.length + 1}`,
          text: q.text.trim(),
          kind: q.kind,
          choices: q.kind === "choice" ? q.choices ?? [] : undefined,
        });
        if (questions.length >= PLAN_MAX_QUESTIONS) break;
      }
    }
  } catch {
    /* fall back to defaults */
  }

  // Top up to the minimum with curated defaults (skipping near-duplicates).
  for (const d of DEFAULT_PLAN_QUESTIONS) {
    if (questions.length >= PLAN_MIN_QUESTIONS) break;
    if (seen.has(d.text.trim().toLowerCase())) continue;
    seen.add(d.text.trim().toLowerCase());
    questions.push({ id: `q-${questions.length + 1}`, ...d });
  }

  return questions.slice(0, PLAN_MAX_QUESTIONS);
}

/**
 * One plan-generation attempt: ask the model for the whole plan as ONE JSON
 * object referencing backlog CODES (E#/M#/Q#), then resolve those codes to
 * real ids. Unknown codes / intra-chapter duplicates are dropped. A transport
 * error propagates; a parse/shape failure returns [] so the caller can retry.
 * (An entity may legitimately appear in DIFFERENT chapters — an epic that
 * spans the journey — so dedup is scoped per chapter.)
 */
async function attemptGeneratePlan(
  ctx: PlanContext,
  answers: Array<{ questionId: string; question: string; answer: string }>,
  temperature: number,
): Promise<PlanChapterChapter[]> {
  const answersBlock = `

USER ANSWERS to your clarifying questions (you MUST honor these):
${answers.map((a) => `- Q: ${a.question}\n  A: ${a.answer || "(no answer)"}`).join("\n")}`;

  // Transport errors throw; everything else degrades to an empty plan.
  const text = await runJsonChatText(
    PLAN_CHAPTER_SYSTEM_PROMPT,
    `${ctx.backlogText}${answersBlock}

Now return the chapter plan as ONE JSON object (the shape above). Use ONLY the E#/M#/Q# codes from the backlog. Spread a big epic's milestones across chapters to show progression.`,
    temperature,
  );

  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    return [];
  }
  const parsed = planChaptersJsonSchema.safeParse(raw);
  if (!parsed.success) return [];

  const chapters: PlanChapterChapter[] = [];
  for (const ch of parsed.data.chapters) {
    const accepted: PlanChapterNode[] = [];
    const seenInChapter = new Set<string>();
    for (const n of ch.nodes) {
      const code = n.ref.trim().toUpperCase();
      const ref = ctx.codeMap.get(code);
      if (!ref) continue; // unknown / hallucinated code → drop
      const key = `${ref.kind}:${ref.id}`;
      if (seenInChapter.has(key)) continue; // duplicate within this chapter
      seenInChapter.add(key);
      accepted.push({ kind: ref.kind, refId: ref.id, tier: n.tier ?? 0 });
    }
    if (accepted.length === 0) continue;
    chapters.push({
      title: ch.title,
      color: ch.color,
      notes: ch.notes,
      nodes: accepted,
    });
  }

  return chapters;
}

export async function planChapterLayout(
  userId: string,
  answers?: Array<{ questionId: string; question: string; answer: string }>,
): Promise<PlanChapterResult> {
  const ctx = await gatherPlanContext(userId);

  if (!ctx.hasBacklog) {
    return {
      kind: "questions",
      questions: [
        {
          id: "q-empty",
          text: "You don't have any Epics, Milestones, or Quests yet — create a few on /epics and /quests first, then come back.",
          kind: "free",
        },
      ],
      model: getActiveModel(),
    };
  }

  // Phase 1 — no answers yet → always return clarifying questions (≥3).
  if (!answers || answers.length === 0) {
    const questions = await generatePlanQuestions(ctx);
    return { kind: "questions", questions, model: getActiveModel() };
  }

  // Phase 2 — generate the plan, retrying if the model yields nothing.
  let chapters: PlanChapterChapter[] = [];
  for (let attempt = 1; attempt <= PLAN_GENERATION_ATTEMPTS; attempt++) {
    // Nudge temperature up on each retry to break out of a bad attractor.
    const temperature = 0.35 + (attempt - 1) * 0.2;
    chapters = await attemptGeneratePlan(ctx, answers, temperature);
    if (chapters.length > 0) break;
  }

  if (chapters.length === 0) {
    throw new Error(
      `The local model couldn't produce a chapter plan after ${PLAN_GENERATION_ATTEMPTS} tries. Try again, or simplify your backlog / answers.`,
    );
  }

  return { kind: "plan", chapters, model: getActiveModel() };
}

// ============================================================================
// Skill Constellation — suggest progression links between skills
// ============================================================================

export type SkillLinkSuggestion = {
  skillId: string;
  requiredSkillId: string;
  skill: string;
  requires: string;
};

const LINK_SKILL_TOOL: Tool = {
  type: "function",
  function: {
    name: "link_skill",
    description:
      "Declare that one skill should be built BEFORE another. Call once per link.",
    parameters: {
      type: "object",
      required: ["skill", "requires"],
      properties: {
        skill: {
          type: "string",
          description: "The more advanced skill (exact name from the list)",
        },
        requires: {
          type: "string",
          description:
            "The foundational skill it builds on (exact name from the list)",
        },
      },
    },
  },
};

/**
 * Ask the local model to propose progression edges among the user's skills
 * (foundational → advanced). Returns only links that reference real skills,
 * aren't duplicates of existing edges, and are cycle-safe.
 */
export async function suggestSkillLinks(
  userId: string,
): Promise<{ links: SkillLinkSuggestion[]; model: string }> {
  const skills = await db.query.skill.findMany({
    where: eq(skill.userId, userId),
    columns: { id: true, name: true, description: true, domain: true },
    orderBy: (t, { asc }) => [asc(t.name)],
  });
  if (skills.length < 2) return { links: [], model: getActiveModel() };

  const byName = new Map(skills.map((s) => [s.name.toLowerCase(), s]));
  const existing = await db.query.skillPrerequisite.findMany({
    where: eq(skillPrerequisite.userId, userId),
    columns: { skillId: true, requiredSkillId: true },
  });
  const existingPairs = new Set(
    existing.map((e) => `${e.skillId}|${e.requiredSkillId}`),
  );

  const listing = skills
    .map(
      (s) =>
        `- ${s.name}${s.domain ? ` [${s.domain}]` : ""}${s.description ? ` — ${s.description}` : ""}`,
    )
    .join("\n");

  const messages: Message[] = [
    {
      role: "system",
      content:
        'You are "The Guide" in a JRPG life-management app. The user has a set of SKILLS. Propose a progression: which skills are foundational and which build on them. Use the link_skill tool — call it once per edge, where `skill` is the more advanced skill and `requires` is its prerequisite. Only use EXACT names from the list. Never invent skills. Link skills within the same domain where it makes sense; keep it sensible and acyclic. A handful of strong links beats many weak ones.',
    },
    {
      role: "user",
      content: `Skills:\n${listing}\n\nPropose the progression links now via link_skill calls.`,
    },
  ];

  const ollama = getOllama();
  const out: SkillLinkSuggestion[] = [];
  const seen = new Set<string>();

  for (let iter = 0; iter < 3; iter++) {
    let resp;
    try {
      resp = await ollama.chat({
        model: getActiveModel(),
        messages,
        tools: [LINK_SKILL_TOOL],
        stream: false,
        options: { temperature: 0.3 },
      });
    } catch (err) {
      throw new Error(describeOllamaError(err, getActiveModel()));
    }
    messages.push(resp.message);
    const calls = resp.message.tool_calls ?? [];
    if (calls.length === 0) break;
    for (const call of calls) {
      const a = call.function.arguments as { skill?: string; requires?: string };
      const s = a.skill ? byName.get(a.skill.trim().toLowerCase()) : undefined;
      const r = a.requires
        ? byName.get(a.requires.trim().toLowerCase())
        : undefined;
      if (!s || !r || s.id === r.id) {
        messages.push({ role: "tool", content: "Invalid — use exact, distinct names." });
        continue;
      }
      const key = `${s.id}|${r.id}`;
      if (seen.has(key) || existingPairs.has(key)) {
        messages.push({ role: "tool", content: "Already linked; pick another." });
        continue;
      }
      seen.add(key);
      out.push({ skillId: s.id, requiredSkillId: r.id, skill: s.name, requires: r.name });
      messages.push({ role: "tool", content: `Linked: ${s.name} ⇐ ${r.name}.` });
    }
  }

  // Final cycle-safety pass (drops anything that would close a loop).
  const safe = planSkillLinks(
    existing,
    out.map((o) => ({ skillId: o.skillId, requiredSkillId: o.requiredSkillId })),
    new Set(skills.map((s) => s.id)),
  );
  const safeKeys = new Set(safe.map((e) => `${e.skillId}|${e.requiredSkillId}`));
  return {
    links: out.filter((o) => safeKeys.has(`${o.skillId}|${o.requiredSkillId}`)),
    model: getActiveModel(),
  };
}

// ============================================================================
// Suggest Skills FROM milestones — read an Epic's chosen Milestones + their
// Steps and propose the competencies (Skills) completing them would build.
// Uses one `format: "json"` call referencing milestones by short M# codes.
// ============================================================================

export type SuggestedSkill = {
  name: string;
  description: string | null;
  domain: string | null;
  /** Selected milestones this skill should be linked to. */
  milestoneIds: string[];
  milestoneTitles: string[];
  /** True if a skill with this name already exists (we'll reuse, not dupe). */
  alreadyExists: boolean;
};

const suggestSkillsJsonSchema = z.object({
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        description: z.string().max(300).nullish(),
        domain: z.string().max(40).nullish(),
        milestones: z.array(z.string().min(1).max(8)).min(1),
      }),
    )
    .min(1),
});

export async function suggestSkillsForMilestones(
  userId: string,
  milestoneIds: string[],
): Promise<{ suggestions: SuggestedSkill[]; model: string }> {
  if (milestoneIds.length === 0) return { suggestions: [], model: getActiveModel() };

  const rows = await db.query.milestone.findMany({
    where: inArray(milestone.id, milestoneIds),
    columns: { id: true, title: true, description: true },
    with: {
      epic: { columns: { title: true, userId: true } },
      steps: { columns: { title: true } },
      skills: { with: { skill: { columns: { name: true } } } },
    },
  });
  const owned = rows.filter((m) => m.epic.userId === userId);
  if (owned.length === 0) return { suggestions: [], model: getActiveModel() };

  const existingSkills = await db.query.skill.findMany({
    where: eq(skill.userId, userId),
    columns: { name: true },
  });
  const existingByName = new Map(
    existingSkills.map((s) => [s.name.toLowerCase(), s.name]),
  );

  // Short codes the model echoes back → real milestone ids.
  const codeToMilestone = new Map<string, { id: string; title: string }>();
  const lines = owned.map((m, i) => {
    const code = `M${i + 1}`;
    codeToMilestone.set(code, { id: m.id, title: m.title });
    const steps = m.steps.slice(0, 12).map((s) => `"${s.title}"`);
    const stepText = steps.length ? `\n    steps: ${steps.join(", ")}` : "";
    const linked = m.skills.map((ms) => ms.skill.name);
    const linkedText = linked.length
      ? `\n    already-linked skills: ${linked.join(", ")}`
      : "";
    return `- ${code} (epic "${m.epic.title}"): "${m.title}"${m.description ? ` — ${m.description}` : ""}${stepText}${linkedText}`;
  });

  const system = `You are "The Guide" in a JRPG life-management app. SKILLS are competencies the user levels up; completing a milestone grants XP to the skills linked to it.

Given some milestones and their steps, propose a SMALL set of concrete, REUSABLE skills that completing them would build. Group several milestones under ONE skill when they train the same competency — prefer a few broad skills over many narrow ones. If an EXISTING skill already covers the work, reuse its exact name (so we link instead of duplicating).

Return ONE JSON object, no prose, no markdown fences, in EXACTLY this shape:
{ "skills": [ { "name": "Spring Boot", "description": "Build REST APIs with Spring Boot", "domain": "Tech", "milestones": ["M1","M3"] } ] }

Rules:
  - 1-6 skills total. Each skill must link to at least one of the milestone codes shown.
  - "milestones" MUST use the exact M# codes from the prompt — never invent codes.
  - Names are short, reusable competencies (e.g. "Dutch", "Endurance", "Spring Boot") — NOT milestone titles or sentences.
  - "domain" is a short one-word grouping (Tech, Language, Body, Mind, Finance, Trade, Creative, …).`;

  const user = `EXISTING SKILLS (reuse a name verbatim if it already fits): ${
    existingSkills.length ? existingSkills.map((s) => s.name).join(", ") : "(none yet)"
  }

MILESTONES:
${lines.join("\n")}

Propose the skills now.`;

  const text = await runJsonChatText(system, user, 0.4);
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    return { suggestions: [], model: getActiveModel() };
  }
  const parsed = suggestSkillsJsonSchema.safeParse(raw);
  if (!parsed.success) return { suggestions: [], model: getActiveModel() };

  const out: SuggestedSkill[] = [];
  const seenNames = new Set<string>();
  for (const s of parsed.data.skills) {
    const name = s.name.trim();
    const key = name.toLowerCase();
    if (!name || seenNames.has(key)) continue;

    const ids: string[] = [];
    const titles: string[] = [];
    for (const code of s.milestones) {
      const m = codeToMilestone.get(code.trim().toUpperCase());
      if (m && !ids.includes(m.id)) {
        ids.push(m.id);
        titles.push(m.title);
      }
    }
    if (ids.length === 0) continue; // not tied to any selected milestone → drop

    seenNames.add(key);
    out.push({
      name,
      description: s.description?.trim() || null,
      domain: s.domain?.trim() || null,
      milestoneIds: ids,
      milestoneTitles: titles,
      alreadyExists: existingByName.has(key),
    });
  }

  return { suggestions: out, model: getActiveModel() };
}

export async function acceptProposals(
  userId: string,
  epicId: string,
  picked: MilestoneProposal[],
  provenance?: MilestoneAIProvenance,
): Promise<{ created: number }> {
  if (picked.length === 0) return { created: 0 };

  const target = await db.query.epic.findFirst({
    where: eq(epic.id, epicId),
  });
  if (!target || target.userId !== userId) {
    throw new Error("Epic not found");
  }

  // Auto-compute position per tier so proposals at the same tier don't stack
  const existing = await db.query.milestone.findMany({
    where: eq(milestone.epicId, epicId),
    columns: { position: true, tier: true },
  });
  const positionsInTier = new Map<number, number>();
  for (const tier of new Set(picked.map((p) => p.tier))) {
    const maxPos = Math.max(
      -1,
      ...existing.filter((m) => m.tier === tier).map((m) => m.position),
    );
    positionsInTier.set(tier, maxPos + 1);
  }

  const rows = picked.map((p) => {
    const pos = positionsInTier.get(p.tier)!;
    positionsInTier.set(p.tier, pos + 1);
    return {
      epicId,
      title: p.title,
      description: p.description,
      tier: p.tier,
      position: pos,
      estimatedStartDate: p.estimatedStartDate,
      estimatedAchievementDate: p.estimatedAchievementDate,
      metadata: provenance ?? null,
    };
  });

  const created = await db.insert(milestone).values(rows).returning();

  await db
    .update(epic)
    .set({ updatedAt: new Date() })
    .where(inArray(epic.id, [epicId]));

  return { created: created.length };
}

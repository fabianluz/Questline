// Client-safe types shared with the streaming SSE endpoint.
// Do NOT import anything server-only here.

export type MilestoneProposal = {
  title: string;
  description?: string;
  tier: number;
  /** Planned start of the milestone window. */
  estimatedStartDate?: string;
  estimatedAchievementDate?: string;
};

export type AdvisorEvent =
  | { type: "start"; model: string; existingMilestones: number }
  | { type: "token"; text: string }
  | { type: "proposal"; proposal: MilestoneProposal; index: number }
  | { type: "tool_skipped"; reason: string }
  | {
      type: "done";
      iterations: number;
      durationMs: number;
      promptTokens: number;
      responseTokens: number;
      proposals: number;
    }
  | { type: "error"; message: string };

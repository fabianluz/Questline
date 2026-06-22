import { eq, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { epic, milestone, prerequisite } from "@/server/db/schema";
import { computeUrgency } from "@/lib/urgency";

export const treeRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const epics = await ctx.db.query.epic.findMany({
      where: eq(epic.userId, ctx.user.id),
      with: { category: true },
    });

    const epicIds = epics.map((e) => e.id);
    if (epicIds.length === 0) {
      return {
        epics: [],
        milestones: [],
        prerequisites: [],
        prereqSteps: [],
        prereqResources: [],
      };
    }

    const milestones = await ctx.db.query.milestone.findMany({
      where: inArray(milestone.epicId, epicIds),
      with: { steps: true, skills: { with: { skill: true } } },
    });

    const milestoneIds = milestones.map((m) => m.id);
    const prereqs = milestoneIds.length
      ? await ctx.db.query.prerequisite.findMany({
          where: inArray(prerequisite.milestoneId, milestoneIds),
          with: {
            requiredMilestone: true,
            requiredStep: true,
            requiredResource: true,
          },
        })
      : [];

    // Compute lock state per milestone.
    const lockedIds = new Set<string>();
    for (const p of prereqs) {
      let met = false;
      if (p.requiredMilestone) {
        met = p.requiredMilestone.status === "completed";
      } else if (p.requiredStep) {
        met = p.requiredStep.isCompleted;
      } else if (p.requiredResource) {
        met = p.requiredResource.acquired;
      }
      if (!met) lockedIds.add(p.milestoneId);
    }

    // Dedupe step/resource prereq sources — same step/resource can block many milestones.
    const stepMap = new Map<
      string,
      { id: string; parentMilestoneId: string; title: string; isCompleted: boolean }
    >();
    const resourceMap = new Map<
      string,
      {
        id: string;
        parentMilestoneId: string;
        label: string;
        kind: string;
        acquired: boolean;
      }
    >();
    for (const p of prereqs) {
      if (p.requiredStep) {
        stepMap.set(p.requiredStep.id, {
          id: p.requiredStep.id,
          parentMilestoneId: p.requiredStep.milestoneId,
          title: p.requiredStep.title,
          isCompleted: p.requiredStep.isCompleted,
        });
      }
      if (p.requiredResource) {
        resourceMap.set(p.requiredResource.id, {
          id: p.requiredResource.id,
          parentMilestoneId: p.requiredResource.milestoneId,
          label: p.requiredResource.label,
          kind: p.requiredResource.kind,
          acquired: p.requiredResource.acquired,
        });
      }
    }

    return {
      epics: epics.map((e) => ({
        id: e.id,
        title: e.title,
        categoryId: e.categoryId,
        category: e.category
          ? { id: e.category.id, name: e.category.name, color: e.category.color }
          : null,
      })),
      milestones: milestones.map((m) => ({
        id: m.id,
        epicId: m.epicId,
        title: m.title,
        description: m.description,
        status: m.status,
        tier: m.tier,
        position: m.position,
        estimatedStartDate: m.estimatedStartDate,
        estimatedAchievementDate: m.estimatedAchievementDate,
        stepProgress: {
          completed: m.steps.filter((s) => s.isCompleted).length,
          total: m.steps.length,
        },
        skills: m.skills.map((ms) => ms.skill.name),
        isLocked: lockedIds.has(m.id),
        urgency: computeUrgency({
          estimatedAchievementDate: m.estimatedAchievementDate,
          status: m.status,
        }),
      })),
      prerequisites: prereqs.map((p) => ({
        id: p.id,
        milestoneId: p.milestoneId,
        requiredMilestoneId: p.requiredMilestoneId,
        requiredStepId: p.requiredStepId,
        requiredResourceId: p.requiredResourceId,
        sourceType: p.requiredMilestoneId
          ? ("milestone" as const)
          : p.requiredStepId
            ? ("step" as const)
            : ("resource" as const),
      })),
      prereqSteps: [...stepMap.values()],
      prereqResources: [...resourceMap.values()],
    };
  }),
});

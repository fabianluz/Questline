/**
 * Pure helper for the Skill Constellation: given the existing prerequisite
 * edges and a batch of candidate edges, return the subset that is safe to
 * add — dropping self-links, duplicates, edges referencing unknown skills,
 * and any edge that would introduce a cycle. Shared by the JSON importer and
 * the bulk "apply AI links" mutation so cycle-safety lives in one place.
 *
 * Edge semantics: `{ skillId requires requiredSkillId }`.
 */
export type SkillEdge = { skillId: string; requiredSkillId: string };

export function planSkillLinks(
  existing: SkillEdge[],
  candidates: SkillEdge[],
  validIds: Set<string>,
): SkillEdge[] {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const arr = adj.get(a) ?? [];
    arr.push(b);
    adj.set(a, arr);
  };
  const seen = new Set<string>();
  for (const e of existing) {
    link(e.skillId, e.requiredSkillId);
    seen.add(`${e.skillId}|${e.requiredSkillId}`);
  }

  // Can `from` already reach `to` by following requires-edges?
  const reaches = (from: string, to: string) => {
    const stack = [from];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === to) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const next of adj.get(cur) ?? []) stack.push(next);
    }
    return false;
  };

  const out: SkillEdge[] = [];
  for (const c of candidates) {
    const { skillId, requiredSkillId } = c;
    if (skillId === requiredSkillId) continue;
    if (!validIds.has(skillId) || !validIds.has(requiredSkillId)) continue;
    const key = `${skillId}|${requiredSkillId}`;
    if (seen.has(key)) continue;
    // Adding (skill requires required) closes a loop iff required already
    // reaches skill.
    if (reaches(requiredSkillId, skillId)) continue;
    seen.add(key);
    link(skillId, requiredSkillId);
    out.push(c);
  }
  return out;
}

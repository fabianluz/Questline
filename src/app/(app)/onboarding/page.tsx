"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Check,
  ChevronRight,
  Crown,
  Flame,
  Mountain,
  Sword,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";

/**
 * §10 — "Level 1" Interactive Onboarding.
 *
 * Tutorial structured as a literal first Epic with three tasks. The user
 * walks through each step, and the user_preference.onboardingStep advances.
 * Completion redirects to /dashboard.
 *
 * Sequence:
 *   1 · avatar       — confirm character (signed-in user)
 *   2 · first_quest  — create + complete the first daily quest
 *   3 · first_epic   — draft the first long-term Epic (boss)
 */

type Step = "avatar" | "first_quest" | "first_epic" | "done";

const STEPS: Step[] = ["avatar", "first_quest", "first_epic", "done"];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: prefs, isLoading } = trpc.wellbeing.getPreferences.useQuery();
  const utils = trpc.useUtils();
  const savePrefs = trpc.wellbeing.updatePreferences.useMutation({
    onSuccess: () => utils.wellbeing.getPreferences.invalidate(),
  });
  const createEpic = trpc.epic.create.useMutation();
  const createQuest = trpc.quest.create.useMutation();
  const toggleQuest = trpc.quest.toggleComplete.useMutation();

  // Migration safety: legacy "health" step is mapped to the new "first_quest".
  const rawStep = prefs?.onboardingStep ?? "avatar";
  const step: Step =
    rawStep === "health" ? "first_quest" : (rawStep as Step);

  const [epicTitle, setEpicTitle] = useState("");
  const [questTitle, setQuestTitle] = useState("Read 10 pages");
  const [questDone, setQuestDone] = useState(false);

  if (isLoading || !session) {
    return (
      <p className="mt-12 text-center text-sm text-zinc-500">Loading...</p>
    );
  }

  async function advance(next: Step) {
    await savePrefs.mutateAsync({
      onboardingStep: next as "avatar" | "first_quest" | "first_epic" | "done",
    });
    if (next === "done") {
      router.replace("/dashboard");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <header className="mb-6 text-center">
        <Crown className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-2 text-2xl font-semibold">Tutorial Level</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Three tasks. Press through to unlock the full skill tree.
        </p>
      </header>

      {/* Progress dots */}
      <div className="mx-auto mb-8 flex w-fit items-center gap-3">
        {STEPS.slice(0, 3).map((s, i) => {
          const idx = STEPS.indexOf(step);
          const done = idx > i;
          const active = idx === i;
          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={
                  "grid h-8 w-8 place-items-center rounded-full border-2 font-display text-sm font-bold transition " +
                  (done
                    ? "border-trails-good bg-trails-good/20 text-trails-good"
                    : active
                      ? "border-trails-accent bg-trails-accent/20 text-trails-accent-bright shadow-[0_0_12px_rgba(247,215,110,0.35)]"
                      : "border-trails-trim/40 bg-trails-bg-deep/60 text-trails-fg-dim")
                }
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < 2 && (
                <div
                  className={
                    "h-0.5 w-8 transition " +
                    (done ? "bg-trails-good" : "bg-trails-trim/30")
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {step === "avatar" && (
        <Card
          icon={<Sword className="h-5 w-5 text-trails-info" />}
          title="Task 1 · Create your character"
        >
          <p className="text-sm text-trails-fg-dim">
            You're signed in as{" "}
            <strong className="text-trails-fg">
              {session.user.name || session.user.email}
            </strong>
            . This is your avatar's name in your skill tree.
          </p>
          <button
            onClick={() => advance("first_quest")}
            className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </Card>
      )}

      {step === "first_quest" && (
        <Card
          icon={<Flame className="h-5 w-5 text-trails-warn" />}
          title="Task 2 · Complete your first Daily Quest"
        >
          <p className="text-sm text-trails-fg-dim">
            Quests are recurring micro-actions that build streaks. Pick a
            starter — you can always change it on /quests.
          </p>
          <input
            type="text"
            value={questTitle}
            onChange={(e) => setQuestTitle(e.target.value)}
            placeholder="e.g. Read 10 pages"
            className="mt-3 w-full rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={async () => {
              const q = await createQuest.mutateAsync({
                title: questTitle.trim() || "Read 10 pages",
                cadence: "daily",
                xpReward: 10,
              });
              await toggleQuest.mutateAsync({ id: q.id });
              setQuestDone(true);
            }}
            disabled={
              createQuest.isPending || toggleQuest.isPending || questDone
            }
            className="mt-3 w-full rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {questDone
              ? "✓ Quest created and marked complete"
              : "Create and check off"}
          </button>
          <button
            onClick={() => advance("first_epic")}
            disabled={!questDone}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </Card>
      )}

      {step === "first_epic" && (
        <Card
          icon={<Mountain className="h-5 w-5 text-trails-good" />}
          title="Boss · Draft your first Epic"
        >
          <p className="text-sm text-trails-fg-dim">
            What's your biggest long-term goal? It'll seed your skill tree.
          </p>
          <input
            type="text"
            value={epicTitle}
            onChange={(e) => setEpicTitle(e.target.value)}
            placeholder="e.g. Master Japanese"
            className="mt-3 w-full rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={async () => {
              if (!epicTitle.trim()) return;
              await createEpic.mutateAsync({
                title: epicTitle.trim(),
              });
              advance("done");
            }}
            disabled={!epicTitle.trim() || createEpic.isPending}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border-2 border-trails-good bg-trails-good/15 px-3 py-2 font-display text-sm font-bold uppercase tracking-widest text-trails-good hover:bg-trails-good/25 disabled:opacity-50"
          >
            Defeat Tutorial Boss → Enter Questline
          </button>
        </Card>
      )}

      <p className="mt-6 text-center text-xs text-trails-fg-dim">
        <button
          onClick={() => advance("done")}
          className="underline hover:text-trails-accent"
        >
          Skip tutorial
        </button>
      </p>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-5">
      <div className="mb-3 flex items-center gap-2 border-b border-trails-trim/30 pb-2">
        {icon}
        <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

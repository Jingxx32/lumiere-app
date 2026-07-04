"use server";

import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  speakingPrompts,
  speakingScripts,
  speakingSessions,
  type SpeakingPrompt,
  type SpeakingScript,
} from "@/lib/db/schema";
import { generateSpeakingScript } from "@/lib/ai/speaking-script";
import { getSpeakingProfile } from "./settings";

export type PromptWithStats = SpeakingPrompt & {
  sessionCount: number;
  bestScore: number | null;
};

export async function listPromptsWithStats(): Promise<PromptWithStats[]> {
  const rows = await db
    .select({
      prompt: speakingPrompts,
      sessionCount: sql<number>`count(${speakingSessions.id})::int`,
      bestScore: sql<number | null>`max((${speakingSessions.scores}->>'overall')::numeric)::int`,
    })
    .from(speakingPrompts)
    .leftJoin(
      speakingSessions,
      sql`${speakingSessions.promptId} = ${speakingPrompts.id} and ${speakingSessions.status} = 'completed'`,
    )
    .groupBy(speakingPrompts.id)
    .orderBy(speakingPrompts.task, speakingPrompts.createdAt);

  return rows.map((r) => ({ ...r.prompt, sessionCount: r.sessionCount, bestScore: r.bestScore }));
}

export async function getPromptWithScript(
  promptId: string,
): Promise<{ prompt: SpeakingPrompt; script: SpeakingScript | null }> {
  const prompt = await db
    .select()
    .from(speakingPrompts)
    .where(eq(speakingPrompts.id, promptId))
    .limit(1)
    .then((r) => r[0]);
  if (!prompt) throw new Error(`Speaking prompt not found: ${promptId}`);

  const script = await db
    .select()
    .from(speakingScripts)
    .where(eq(speakingScripts.promptId, promptId))
    .orderBy(desc(speakingScripts.createdAt))
    .limit(1)
    .then((r) => r[0] ?? null);

  return { prompt, script };
}

export async function generateScript(promptId: string): Promise<SpeakingScript> {
  const { prompt } = await getPromptWithScript(promptId);
  const profile = await getSpeakingProfile();
  const content = await generateSpeakingScript(prompt, profile);

  const [script] = await db
    .insert(speakingScripts)
    .values({ promptId, content, profileSnapshot: profile || null })
    .returning();

  revalidatePath(`/speaking/${promptId}/script`);
  return script;
}

export async function updateScript(scriptId: string, content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Script content cannot be empty");
  const [row] = await db
    .update(speakingScripts)
    .set({ content: trimmed })
    .where(eq(speakingScripts.id, scriptId))
    .returning({ promptId: speakingScripts.promptId });
  if (row) revalidatePath(`/speaking/${row.promptId}/script`);
}

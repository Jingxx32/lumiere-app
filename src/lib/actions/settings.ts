"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { openai, MODELS } from "@/lib/ai/client";
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import type { CefrLevel } from "@/lib/cefr";
import { CEFR_LEVELS } from "@/lib/cefr";

export type ApiKeyStatus =
  | { ok: true; maskedKey: string; models: typeof MODELS }
  | { ok: false; error: string };

export async function testApiKey(): Promise<ApiKeyStatus> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, error: "OPENAI_API_KEY is not set in your .env file." };
  }

  try {
    await openai.models.list();
    const maskedKey = key.slice(0, 7) + "·".repeat(16) + key.slice(-4);
    return { ok: true, maskedKey, models: MODELS };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  getCefrLevel / setCefrLevel                                        */
/* ------------------------------------------------------------------ */

export async function getCefrLevel(): Promise<CefrLevel | null> {
  const row = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.key, "cefr_level"))
    .limit(1)
    .then((r) => r[0] ?? null);
  const val = row?.value;
  return CEFR_LEVELS.includes(val as CefrLevel) ? (val as CefrLevel) : null;
}

export async function setCefrLevel(level: CefrLevel): Promise<void> {
  await db
    .insert(userSettings)
    .values({ key: "cefr_level", value: level })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value: level, updatedAt: new Date() },
    });
  revalidatePath("/settings");
}

/* ------------------------------------------------------------------ */
/*  getSpeakingProfile / setSpeakingProfile                            */
/* ------------------------------------------------------------------ */

export async function getSpeakingProfile(): Promise<string> {
  const row = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.key, "speaking_profile"))
    .limit(1)
    .then((r) => r[0] ?? null);
  return row?.value ?? "";
}

export async function setSpeakingProfile(text: string): Promise<void> {
  await db
    .insert(userSettings)
    .values({ key: "speaking_profile", value: text })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value: text, updatedAt: new Date() },
    });
  revalidatePath("/settings");
}

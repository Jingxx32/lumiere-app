"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { readingSessions, documents } from "@/lib/db/schema";

export async function createReadingSession(documentId: string): Promise<string> {
  const doc = await db
    .select({ title: documents.title })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1)
    .then((r) => r[0] ?? null);

  const id = randomUUID();
  await db.insert(readingSessions).values({
    id,
    documentId,
    documentTitleSnapshot: doc?.title ?? null,
    vocabularyLookedUp: [],
  });
  return id;
}

export async function updateSessionDuration(
  sessionId: string,
  durationSeconds: number,
): Promise<void> {
  await db
    .update(readingSessions)
    .set({ durationSeconds, endedAt: new Date() })
    .where(eq(readingSessions.id, sessionId));
}

export async function updateReadingProgress(
  documentId: string,
  progress: number,
): Promise<void> {
  await db
    .update(documents)
    .set({ readingProgress: Math.round(progress) })
    .where(eq(documents.id, documentId));
}

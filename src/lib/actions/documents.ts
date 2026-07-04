"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { eq, desc, ilike, or, and, count, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { documents, readingSessions } from "@/lib/db/schema";
import { countWords, naiveLevelEstimate } from "@/lib/cefr";
import { estimateCefrLevel } from "@/lib/ai/cefr-estimator";

const NewDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  source: z.string().trim().max(200).optional().or(z.literal("")),
  sourceUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  type: z.enum(["news", "literature", "personal", "other"]).default("other"),
  content: z
    .string()
    .trim()
    .min(20, "Content must be at least 20 characters"),
});

export type CreateDocumentResult =
  | { ok: true; id: string }
  | { ok: false; errors: Record<string, string> };

export async function createDocument(
  _prevState: CreateDocumentResult | null,
  formData: FormData,
): Promise<CreateDocumentResult> {
  const raw = {
    title: formData.get("title")?.toString() ?? "",
    source: formData.get("source")?.toString() ?? "",
    sourceUrl: formData.get("sourceUrl")?.toString() ?? "",
    type: (formData.get("type")?.toString() ?? "other") as
      | "news"
      | "literature"
      | "personal"
      | "other",
    content: formData.get("content")?.toString() ?? "",
  };

  const parsed = NewDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      errors[key] = issue.message;
    }
    return { ok: false, errors };
  }

  const id = randomUUID();
  const content = parsed.data.content;
  const wordCount = countWords(content);

  // Insert immediately with a cheap heuristic level so saving returns in ~ms;
  // refine with the LLM estimate after the response is sent.
  await db.insert(documents).values({
    id,
    title: parsed.data.title,
    source: parsed.data.source || null,
    sourceUrl: parsed.data.sourceUrl || null,
    type: parsed.data.type,
    content,
    wordCount,
    estimatedLevel: naiveLevelEstimate(content),
    readingProgress: 0,
  });

  after(async () => {
    try {
      const level = await estimateCefrLevel(content);
      await db.update(documents).set({ estimatedLevel: level }).where(eq(documents.id, id));
      revalidatePath("/library");
      revalidatePath(`/documents/${id}`);
    } catch (err) {
      console.error("CEFR estimate failed:", err);
    }
  });

  revalidatePath("/library");
  return { ok: true, id };
}

export async function deleteDocument(id: string) {
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/library");
}

export async function touchDocumentReadAt(id: string) {
  await db
    .update(documents)
    .set({ lastReadAt: new Date() })
    .where(eq(documents.id, id));
}

export async function openDocument(id: string) {
  await touchDocumentReadAt(id);
  redirect(`/documents/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Read helpers (callable from server components)                     */
/* ------------------------------------------------------------------ */

export async function listDocuments(opts?: {
  type?: string;
  query?: string;
}) {
  const filters: SQL[] = [];
  if (opts?.type && opts.type !== "all") {
    filters.push(eq(documents.type, opts.type as "news" | "literature" | "personal" | "other"));
  }
  if (opts?.query) {
    const q = `%${opts.query}%`;
    filters.push(or(ilike(documents.title, q), ilike(documents.content, q))!);
  }

  return db
    .select()
    .from(documents)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(sql`${documents.lastReadAt} desc nulls last`, desc(documents.createdAt));
}

export async function getDocument(id: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);
}

export async function getMostRecentDocument() {
  return db
    .select()
    .from(documents)
    .orderBy(sql`${documents.lastReadAt} desc nulls last`, desc(documents.createdAt))
    .limit(1)
    .then((r) => r[0] ?? null);
}

export async function getDocumentSessionCount(id: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(readingSessions)
    .where(eq(readingSessions.documentId, id));
  return result[0]?.count ?? 0;
}

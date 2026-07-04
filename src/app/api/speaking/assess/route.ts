import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { speakingTurns } from "@/lib/db/schema";
import { assessPronunciation } from "@/lib/speech/azure";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "missing_audio" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "missing_audio" }, { status: 400 });
  }
  const referenceText = (form.get("referenceText") as string | null)?.trim() || null;
  const sessionId = (form.get("sessionId") as string | null) || null;
  const orderIndexRaw = form.get("orderIndex") as string | null;

  const wav = Buffer.from(await audio.arrayBuffer());

  let result;
  try {
    result = await assessPronunciation(wav, referenceText);
  } catch (err) {
    console.error("[speaking/assess]", err);
    return Response.json({ error: "azure_failed" }, { status: 502 });
  }
  if (!result) {
    return Response.json({ error: "no_speech" }, { status: 422 });
  }

  let turnId: string | undefined;
  const orderIndex = orderIndexRaw === null ? NaN : parseInt(orderIndexRaw, 10);
  if (sessionId && Number.isInteger(orderIndex)) {
    const dir = path.join(process.cwd(), "public", "media", "speaking", sessionId);
    await mkdir(dir, { recursive: true });
    const filename = `${String(orderIndex).padStart(3, "0")}.wav`;
    await writeFile(path.join(dir, filename), wav);

    const { transcript, ...assessment } = result;
    const [turn] = await db
      .insert(speakingTurns)
      .values({
        sessionId,
        orderIndex,
        role: "user",
        text: transcript,
        audioPath: `/media/speaking/${sessionId}/${filename}`,
        assessment,
      })
      .returning({ id: speakingTurns.id });
    turnId = turn.id;
  }

  return Response.json({ ...result, turnId });
}

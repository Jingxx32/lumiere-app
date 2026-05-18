import { notFound } from "next/navigation";
import { getDocument } from "@/lib/actions/documents";
import { ReaderShell } from "./_components/reader-client";

export default async function DocumentReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();

  const paragraphs = doc.content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return <ReaderShell doc={doc} paragraphs={paragraphs} />;
}

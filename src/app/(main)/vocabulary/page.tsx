import { getVocabEntries } from "@/lib/actions/vocabulary";
import { getCefrLevel } from "@/lib/actions/settings";
import { VocabBrowser } from "./_components/vocab-browser";

export const dynamic = "force-dynamic";

export default async function VocabularyPage() {
  const [entries, level] = await Promise.all([getVocabEntries(), getCefrLevel()]);
  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-1">Vocabulary</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Every word you looked up while reading or practising TCF.
      </p>
      <VocabBrowser initialEntries={entries} learnerLevel={level ?? "A2"} />
    </div>
  );
}

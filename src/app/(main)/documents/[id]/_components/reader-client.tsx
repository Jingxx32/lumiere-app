"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  createReadingSession,
  updateReadingProgress,
  updateSessionDuration,
} from "@/lib/actions/reading";
import { upsertVocabularyLookup, saveVocabularyWord } from "@/lib/actions/vocabulary";
import { generateWritingTask } from "@/lib/actions/tasks";
import type { LookupResult } from "@/lib/ai/lookup";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import { cn } from "@/lib/utils";
import type { Document } from "@/lib/db/schema";
import { WordLookupPopover } from "./word-lookup-popover";
import { SessionSidebar } from "./session-sidebar";

type Props = {
  doc: Document;
  paragraphs: string[];
  initialSavedWords: string[];
};

export function ReaderShell({ doc, paragraphs, initialSavedWords }: Props) {
  const router = useRouter();
  const articleRef = useRef<HTMLElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const [savedWords, setSavedWords] = useState<string[]>(initialSavedWords);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const level = (doc.estimatedLevel ?? "B1") as CefrLevel;

  // Create reading session on mount; flush duration on unmount
  useEffect(() => {
    createReadingSession(doc.id).then((id) => {
      sessionIdRef.current = id;
    });
    return () => {
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (sessionIdRef.current) {
        void updateSessionDuration(sessionIdRef.current, duration);
      }
    };
  }, [doc.id]);

  // Reading progress via IntersectionObserver
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const paras = Array.from(article.querySelectorAll("p"));
    if (paras.length === 0) return;

    let lastReported = 0;
    const seen = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = paras.indexOf(entry.target as HTMLParagraphElement);
            if (idx !== -1) seen.add(idx);
          }
        });
        const progress = Math.round((seen.size / paras.length) * 100);
        if (progress > lastReported) {
          lastReported = progress;
          void updateReadingProgress(doc.id, progress);
        }
      },
      { threshold: 0.5 },
    );

    paras.forEach((p) => observer.observe(p));
    return () => observer.disconnect();
  }, [doc.id]);

  const handleLookupWord = useCallback(
    async (word: string, surface: string, result: LookupResult, sentenceContext: string) => {
      if (!sessionIdRef.current) return;
      await upsertVocabularyLookup(word, surface, result, doc.id, sessionIdRef.current, sentenceContext);
    },
    [doc.id],
  );

  async function handleSaveWord(word: string, _surface: string) {
    const lower = word.toLowerCase();
    setSavedWords((prev) => (prev.includes(lower) ? prev : [...prev, lower]));
    await saveVocabularyWord(lower);
  }

  async function handleGenerateTask(vocabWords: string[] = []) {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const taskId = await generateWritingTask(doc.id, vocabWords);
      router.push(`/practice?taskId=${taskId}`);
    } catch {
      setGenerateError("Failed to generate task. Check your API key in Settings.");
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] min-h-screen relative">
      {/* Main reading column */}
      <div className="px-10 py-10 max-w-[820px] w-full mx-auto">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-3xl font-semibold tracking-tight break-words">
              {doc.title}
            </h1>
            {doc.source && (
              <p className="mt-1 text-sm text-muted-foreground">{doc.source}</p>
            )}
          </div>
          <Button
            variant="default"
            disabled={isGenerating}
            onClick={() => handleGenerateTask()}
            className="self-start shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Writing Task
          </Button>
        </div>

        {generateError && (
          <p className="mb-4 text-sm text-danger bg-danger-soft rounded-lg px-4 py-2">
            {generateError}
          </p>
        )}

        <div className="flex items-center gap-2 mb-10">
          <Chip className={cn("ring-0", CEFR_CHIP_CLASSES[level])}>{level}</Chip>
          <Chip>{doc.wordCount.toLocaleString()} words</Chip>
          {doc.readingProgress > 0 && (
            <Chip>{doc.readingProgress}% read</Chip>
          )}
        </div>

        <article ref={articleRef} className="reading-prose">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </article>
      </div>

      {/* Word lookup popover — absolute within the grid */}
      <WordLookupPopover
        articleRef={articleRef}
        onLookup={handleLookupWord}
        onSave={handleSaveWord}
        savedWords={savedWords}
      />

      {/* This Session sidebar */}
      <SessionSidebar
        savedWords={savedWords}
        isGenerating={isGenerating}
        onGenerateFromWords={() => handleGenerateTask(savedWords)}
      />
    </div>
  );
}

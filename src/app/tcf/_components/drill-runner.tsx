"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Check, X, Loader2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExplanationPanel } from "./explanation-panel";
import { LevelNav } from "./level-nav";
import { WordLookupPopover } from "@/components/word-lookup-popover";
import { recordTcfQuestionAttempt } from "@/lib/actions/tcf";
import { writeFromTcfPassage } from "@/lib/actions/tasks";
import type { TcfQuestionForDrill, TcfLevel } from "@/lib/actions/tcf";

const LEVEL_COLORS: Record<TcfLevel, { bg: string; text: string }> = {
  A1: { bg: "bg-success-soft", text: "text-success" },
  A2: { bg: "bg-success-soft", text: "text-success" },
  B1: { bg: "bg-warning-soft", text: "text-warning" },
  B2: { bg: "bg-warning-soft", text: "text-warning" },
  C1: { bg: "bg-accent-soft", text: "text-accent" },
  C2: { bg: "bg-accent-soft", text: "text-accent" },
};

const TYPE_LABELS: Record<TcfQuestionForDrill["type"], string> = {
  image: "Image",
  spoken_options: "Écoute",
  dialogue: "Dialogue",
  reading_mcq: "Lecture",
};

/** P12c: turn the passage just read into writing material — reuses the whole
 *  task-generation pipeline with the passage as content source. */
function WritePassageButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      try {
        const taskId = await writeFromTcfPassage(questionId);
        router.push(`/practice?taskId=${taskId}`);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-60"
      >
        {pending ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Génération…</>
        ) : (
          <><PenLine className="h-3.5 w-3.5" /> Écrire sur ce texte</>
        )}
      </button>
      {failed && <span className="text-xs text-danger">Échec — réessayez.</span>}
    </div>
  );
}

interface DrillRunnerProps {
  questions: TcfQuestionForDrill[];
  initialIndex?: number;
  savedLemmas?: string[];
  /** Question ids with recorded attempts — DB-derived "done" marks. */
  initialDoneIds?: string[];
}

export function DrillRunner({
  questions,
  initialIndex = 0,
  savedLemmas: initialSavedLemmas = [],
  initialDoneIds = [],
}: DrillRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showAnswer, setShowAnswer] = useState(false);
  // Option index the user clicked for the current question (undefined = not chosen yet).
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const [savedLemmas, setSavedLemmas] = useState<string[]>(initialSavedLemmas);
  const contentRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set(initialDoneIds));

  if (questions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Aucune question disponible.
      </div>
    );
  }

  const q = questions[currentIndex];
  const levelColors = LEVEL_COLORS[q.level];

  function goTo(index: number) {
    setCurrentIndex(index);
    setShowAnswer(false);
    setChosen(undefined);
  }

  function toggleAnswer() {
    const next = !showAnswer;
    setShowAnswer(next);
    // Hiding the answer also clears the selection so the question is fresh again.
    if (!next) setChosen(undefined);
    // Peeking at the answer is NOT answering — it no longer marks done or
    // writes an attempt (error-loop spec §4.2).
  }

  // Clicking an option records the choice and immediately reveals the correct
  // answer. The attempt is persisted fire-and-forget: losing one row on a
  // network hiccup beats interrupting the drill.
  function choose(optionIndex: number) {
    setChosen(optionIndex);
    setShowAnswer(true);
    setDone((prev) => (prev.has(q.id) ? prev : new Set(prev).add(q.id)));
    void recordTcfQuestionAttempt({
      questionId: q.id,
      chosen: optionIndex,
      correct: optionIndex === q.answer,
    }).catch(() => {});
  }

  return (
    <div className="flex gap-6 min-h-0">
      {/* Left nav */}
      <LevelNav
        questions={questions}
        currentIndex={currentIndex}
        onSelect={goTo}
        doneIds={done}
      />

      {/* Main question area */}
      <div className="flex-1 min-w-0">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg font-semibold text-foreground">
              Q{currentIndex + 1}
            </span>
            <span className="text-xs text-subtle-foreground">
              Test {q.testNumber} · {q.orderIndex}
            </span>
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold font-mono", levelColors.bg, levelColors.text)}>
              {q.level}
            </span>
            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {TYPE_LABELS[q.type]}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleAnswer}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              showAnswer
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-border/60 bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {showAnswer ? (
              <><EyeOff className="h-3.5 w-3.5" /> Masquer réponse</>
            ) : (
              <><Eye className="h-3.5 w-3.5" /> Afficher réponse</>
            )}
          </button>
        </div>

        {/* Question card */}
        <div ref={contentRef} className="rounded-xl border border-border/70 bg-surface px-6 py-5 space-y-4">
          {/* Instruction */}
          <p data-selectable className="text-sm text-muted-foreground italic">{q.questionText}</p>

          {/* Image (image type) */}
          {q.type === "image" && (
            <div className="rounded-lg overflow-hidden border border-border/50 bg-surface-muted">
              {q.imagePath ? (
                <Image
                  src={q.imagePath}
                  alt={`Question ${q.orderIndex} image`}
                  width={600}
                  height={400}
                  className="w-full object-contain max-h-64"
                  unoptimized
                />
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Image non disponible
                </div>
              )}
            </div>
          )}

          {/* Reading — text passage or document image */}
          {q.type === "reading_mcq" && q.passage && (
            <div className="space-y-2">
              <article className="reading-prose rounded-lg border border-border/50 bg-surface-muted/40 px-5 py-4 whitespace-pre-wrap">
                {q.passage}
              </article>
              <WritePassageButton questionId={q.id} />
            </div>
          )}
          {q.type === "reading_mcq" && !q.passage && q.imagePath && (
            <div className="rounded-lg overflow-hidden border border-border/50 bg-surface-muted">
              <Image
                src={q.imagePath}
                alt={`Document question ${q.orderIndex}`}
                width={800}
                height={520}
                className="w-full object-contain"
                unoptimized
              />
            </div>
          )}

          {/* Audio placeholder — listening only */}
          {q.type !== "reading_mcq" &&
            (q.audioPath ? (
              <audio controls src={q.audioPath} className="w-full" />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-surface-muted/40 px-4 py-3">
                <div className="h-8 w-8 rounded-full bg-surface-muted flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted-foreground" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground">Audio à générer (§6)</p>
              </div>
            ))}

          {/* Options
              dialogue: text always visible; answer highlight on reveal
              image / spoken_options: options are audio-only in the real exam —
              show only A/B/C/D by default; reveal text + highlight on answer toggle */}
          <div className="space-y-1.5">
            {q.options.map((option, i) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrect = i === q.answer;
              const isChosen = chosen === i;
              const isWrongChoice = showAnswer && isChosen && !isCorrect;
              const audioOnly = q.type === "image" || q.type === "spoken_options";
              const showText = !audioOnly || showAnswer;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => choose(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-left transition-colors",
                    showAnswer && isCorrect
                      ? "border-success/40 bg-success-soft text-success"
                      : isWrongChoice
                        ? "border-danger/40 bg-danger-soft text-danger"
                        : "border-border/60 bg-surface text-foreground hover:border-accent/30 hover:bg-accent-soft/40 cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                      showAnswer && isCorrect
                        ? "border-success text-success"
                        : isWrongChoice
                          ? "border-danger text-danger"
                          : "border-border",
                    )}
                  >
                    {showAnswer && isCorrect ? (
                      <Check className="h-3 w-3" />
                    ) : isWrongChoice ? (
                      <X className="h-3 w-3" />
                    ) : (
                      letter
                    )}
                  </span>
                  {showText ? (
                    <span data-selectable>{option}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {q.type === "spoken_options" ? "Réponse" : "Proposition"} {letter}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Transcript (reveal on answer) */}
          {showAnswer && q.transcript && (
            <div className="rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-widest text-subtle-foreground font-medium mb-1.5">
                Transcription
              </p>
              <p className="text-sm font-serif leading-relaxed text-foreground whitespace-pre-wrap">
                {q.transcript}
              </p>
            </div>
          )}

          {/* Explanation (reveal on answer) */}
          {showAnswer && q.explanation && <ExplanationPanel markdown={q.explanation} />}
        </div>

        <WordLookupPopover
          containerRef={contentRef}
          source={{ type: "tcf", tcfQuestionId: q.id }}
          savedLemmas={savedLemmas}
          onSaved={(lemma) =>
            setSavedLemmas((prev) => (prev.includes(lemma) ? prev : [...prev, lemma]))
          }
        />

        {/* Prev / Next */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Précédent
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} / {questions.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex === questions.length - 1}
          >
            Suivant
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

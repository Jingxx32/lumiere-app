"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BookmarkPlus, ExternalLink, X } from "lucide-react";
import { lookupWord, type LookupResult } from "@/lib/ai/lookup";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import { cn } from "@/lib/utils";

type PopoverState =
  | { phase: "hidden" }
  | { phase: "loading"; word: string; x: number; y: number }
  | { phase: "ready"; word: string; result: LookupResult; x: number; y: number };

type Props = {
  articleRef: React.RefObject<HTMLElement | null>;
  onSave: (word: string, surface: string) => void;
  savedWords: string[];
};

export function WordLookupPopover({ articleRef, onSave, savedWords }: Props) {
  const [state, setState] = useState<PopoverState>({ phase: "hidden" });
  const [isPending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    function handleMouseUp(e: MouseEvent) {
      // Ignore clicks inside the popover itself
      if (popoverRef.current?.contains(e.target as Node)) return;

      const selection = window.getSelection();
      const rawText = selection?.toString().trim();
      if (!rawText || rawText.length < 2 || rawText.length > 80) {
        setState({ phase: "hidden" });
        return;
      }
      const text = rawText.normalize("NFC");

      // Get context sentence by finding surrounding text
      const range = selection!.getRangeAt(0);
      const container = range.startContainer;
      const paragraph = (container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : (container as Element)
      )?.closest("p");
      const sentenceContext = (paragraph?.textContent ?? text).normalize("NFC");

      // Position below the selection
      const rect = range.getBoundingClientRect();
      const x = Math.min(rect.left + rect.width / 2, window.innerWidth - 320);
      const y = rect.bottom + window.scrollY + 8;

      setState({ phase: "loading", word: text, x, y });

      startTransition(async () => {
        try {
          const result = await lookupWord(text, sentenceContext);
          setState((prev) =>
            prev.phase !== "hidden" ? { phase: "ready", word: text, result, x, y } : prev,
          );
        } catch {
          setState({ phase: "hidden" });
        }
      });
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setState({ phase: "hidden" });
    }

    article.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      article.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [articleRef]);

  if (state.phase === "hidden") return null;

  const { word, x, y } = state;
  const isSaved = savedWords.includes(word.toLowerCase());

  return (
    <div
      ref={popoverRef}
      style={{ position: "absolute", left: x, top: y, transform: "translateX(-50%)" }}
      className="z-50 w-80 rounded-2xl border border-border bg-surface shadow-xl"
      onMouseDown={(e) => e.preventDefault()} // prevent selection loss
    >
      {state.phase === "loading" ? (
        <LoadingSkeleton word={word} onClose={() => setState({ phase: "hidden" })} />
      ) : (
        <LookupCard
          word={word}
          result={state.result}
          isSaved={isSaved}
          onSave={() => onSave(word, word)}
          onClose={() => setState({ phase: "hidden" })}
        />
      )}
    </div>
  );
}

function LoadingSkeleton({ word, onClose }: { word: string; onClose: () => void }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-serif text-base font-semibold">{word}</span>
        <button onClick={onClose} className="text-subtle-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2 animate-pulse">
        {[40, 64, 48, 80, 56].map((w, i) => (
          <div key={i} className="h-3 rounded bg-surface-muted" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

function LookupCard({
  word,
  result,
  isSaved,
  onSave,
  onClose,
}: {
  word: string;
  result: LookupResult;
  isSaved: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const level = result.level as CefrLevel;

  return (
    <div className="p-4 space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-serif text-base font-semibold text-foreground">{word}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{result.pos}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Chip className={cn("ring-0 text-[10px] py-0", CEFR_CHIP_CLASSES[level])}>
            {level}
          </Chip>
          <button onClick={onClose} className="text-subtle-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Divider />

      {/* Translation */}
      <Section label="Translation">
        <p className="text-foreground">{result.translation}</p>
      </Section>

      {/* Conjugation — verbs only */}
      {result.conjugation && (
        <>
          <Divider />
          <Section label="Conjugation (présent)">
            <p className="text-foreground font-mono text-xs leading-relaxed">
              {result.conjugation}
            </p>
          </Section>
        </>
      )}

      <Divider />

      {/* In this context */}
      <Section label="In this context">
        <p className="text-foreground">{result.in_context}</p>
      </Section>

      <Divider />

      {/* Examples */}
      <Section label="Examples">
        <ul className="space-y-1">
          {result.examples.map((ex, i) => (
            <li key={i} className="text-foreground font-serif italic">
              {ex}
            </li>
          ))}
        </ul>
      </Section>

      <Divider />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          variant={isSaved ? "soft" : "outline"}
          className="flex-1"
          onClick={onSave}
          disabled={isSaved}
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          {isSaved ? "Saved" : "+ Save to vocabulary"}
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <a
            href={`https://www.wordreference.com/fren/${encodeURIComponent(word)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Dict
          </a>
        </Button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-accent font-medium">{label}</div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/50" />;
}

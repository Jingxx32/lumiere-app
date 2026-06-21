"use client";

import { cn } from "@/lib/utils";
import type { TcfQuestionForDrill, TcfLevel } from "@/lib/actions/tcf";

interface LevelNavProps {
  questions: TcfQuestionForDrill[];
  currentIndex: number;
  onSelect: (index: number) => void;
  /** Ids of questions already done (answer revealed). */
  doneIds: Set<string>;
  /** Clear all "done" marks. */
  onClear: () => void;
}

const LEVEL_ORDER: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

const LEVEL_COLORS: Record<TcfLevel, string> = {
  A1: "text-success",
  A2: "text-success",
  B1: "text-warning",
  B2: "text-warning",
  C1: "text-accent",
  C2: "text-accent",
};

export function LevelNav({
  questions,
  currentIndex,
  onSelect,
  doneIds,
  onClear,
}: LevelNavProps) {
  // Group by level in fixed order
  const byLevel: Record<string, Array<{ q: TcfQuestionForDrill; idx: number }>> = {};
  questions.forEach((q, idx) => {
    if (!byLevel[q.level]) byLevel[q.level] = [];
    byLevel[q.level].push({ q, idx });
  });

  const doneCount = questions.reduce((n, q) => (doneIds.has(q.id) ? n + 1 : n), 0);

  return (
    <nav className="w-[180px] shrink-0 space-y-4">
      {/* Done summary + clear */}
      <div className="flex items-center justify-between h-5">
        <span className="text-[11px] text-muted-foreground">
          {doneCount > 0 ? `${doneCount} fait${doneCount > 1 ? "s" : ""}` : " "}
        </span>
        {doneCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-subtle-foreground hover:text-danger transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      {LEVEL_ORDER.filter((l) => byLevel[l]).map((level) => (
        <div key={level}>
          <p className={cn("text-[11px] uppercase tracking-widest font-medium mb-1.5", LEVEL_COLORS[level])}>
            {level}
          </p>
          <div className="flex flex-wrap gap-1">
            {byLevel[level].map(({ q, idx }, posInLevel) => {
              const isCurrent = idx === currentIndex;
              const isDone = doneIds.has(q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onSelect(idx)}
                  title={`Test ${q.testNumber} Q${q.orderIndex}${isDone ? " · fait" : ""}`}
                  className={cn(
                    "relative h-7 w-7 rounded text-xs font-medium transition-colors",
                    isCurrent
                      ? "bg-accent text-accent-foreground"
                      : isDone
                        ? "bg-success-soft text-success hover:bg-success-soft"
                        : "bg-surface-muted text-muted-foreground hover:bg-accent-soft hover:text-accent",
                  )}
                >
                  {posInLevel + 1}
                  {isDone && !isCurrent && (
                    <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-success" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

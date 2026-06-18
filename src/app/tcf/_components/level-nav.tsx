"use client";

import { cn } from "@/lib/utils";
import type { TcfQuestionForDrill, TcfLevel } from "@/lib/actions/tcf";

interface LevelNavProps {
  questions: TcfQuestionForDrill[];
  currentIndex: number;
  onSelect: (index: number) => void;
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

export function LevelNav({ questions, currentIndex, onSelect }: LevelNavProps) {
  // Group by level in fixed order
  const byLevel: Record<string, Array<{ q: TcfQuestionForDrill; idx: number }>> = {};
  questions.forEach((q, idx) => {
    if (!byLevel[q.level]) byLevel[q.level] = [];
    byLevel[q.level].push({ q, idx });
  });

  return (
    <nav className="w-[180px] shrink-0 space-y-4">
      {LEVEL_ORDER.filter((l) => byLevel[l]).map((level) => (
        <div key={level}>
          <p className={cn("text-[11px] uppercase tracking-widest font-medium mb-1.5", LEVEL_COLORS[level])}>
            {level}
          </p>
          <div className="flex flex-wrap gap-1">
            {byLevel[level].map(({ q, idx }, posInLevel) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onSelect(idx)}
                title={`Test ${q.testNumber} Q${q.orderIndex}`}
                className={cn(
                  "h-7 w-7 rounded text-xs font-medium transition-colors",
                  idx === currentIndex
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-muted text-muted-foreground hover:bg-accent-soft hover:text-accent",
                )}
              >
                {posInLevel + 1}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

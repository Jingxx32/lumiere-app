"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { setStudyGoal, type StudyGoal } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";

const CLB_OPTIONS = [4, 5, 6, 7, 8, 9, 10];

export function StudyGoalEditor({ initial }: { initial: StudyGoal }) {
  const [targetClb, setTargetClb] = useState<string>(
    initial.targetClb !== null ? String(initial.targetClb) : "",
  );
  const [examDate, setExamDate] = useState<string>(initial.examDate ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(false);
    startTransition(async () => {
      await setStudyGoal({
        targetClb: targetClb ? Number(targetClb) : null,
        examDate: examDate || null,
      });
      setSaved(true);
    });
  }

  const inputClasses =
    "h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Target CLB/NCLC
          <select
            value={targetClb}
            onChange={(e) => setTargetClb(e.target.value)}
            className={inputClasses}
          >
            <option value="">Not set</option>
            {CLB_OPTIONS.map((n) => (
              <option key={n} value={n}>
                CLB {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Exam date (optional)
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className={inputClasses}
          />
        </label>
        <Button onClick={handleSave} disabled={pending} size="sm">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved && !pending ? "Saved" : "Save goal"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Powers the Readiness card on Progress and the daily plan. Leave the date
        empty while you&apos;re in long-term prep mode.
      </p>
    </div>
  );
}

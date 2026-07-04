"use client";

import type { FrenchVocabEntry, TenseBlock } from "@/lib/ai/enrich";
import { visibleTenses } from "@/lib/vocab/display";
import { cn } from "@/lib/utils";

export function VerbTenses({
  entry,
  learnerLevel,
}: {
  entry: FrenchVocabEntry;
  learnerLevel: string;
}) {
  if (!entry.verb) return null;
  const tenses = visibleTenses(entry, learnerLevel);
  if (tenses.length === 0) return null;

  return (
    <div className="space-y-3">
      {tenses.map(({ key, focus }) => {
        const block = (entry.verb!.tenses as Record<string, TenseBlock | null>)[key];
        if (!block) return null;
        // Subjonctif is always introduced by "que"/"qu'" — stored bare, prefixed here.
        const subjonctif = key.startsWith("subjonctif");
        return (
          <div key={key} className="rounded-lg border border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={cn(
                  "text-xs font-medium",
                  focus ? "text-accent" : "text-muted-foreground",
                )}
              >
                {focus ? "★ " : ""}
                {key}
              </span>
              <span className="text-[10px] text-muted-foreground">{block.level}</span>
            </div>
            {block.type === "simple" && block.forms ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 font-mono text-xs">
                {Object.entries(block.forms)
                  .filter(([, form]) => form)
                  .map(([person, form]) => {
                    // "qu'" before a vowel-initial pronoun (il/ils), else "que ".
                    const prefix = subjonctif
                      ? /^[aeiouyéèh]/i.test(person)
                        ? "qu'"
                        : "que "
                      : "";
                    return (
                      <span key={person}>
                        <span className="text-muted-foreground">
                          {prefix}
                          {person}
                        </span>{" "}
                        {form}
                      </span>
                    );
                  })}
              </div>
            ) : (
              <p className="font-mono text-xs text-foreground">{block.sample}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

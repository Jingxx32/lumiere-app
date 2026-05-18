"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useTransition } from "react";
import { X } from "lucide-react";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { CATEGORY_STYLES } from "@/lib/category-styles";

const CATEGORIES = Object.keys(ERROR_TAXONOMY) as ErrorCategory[];

type Props = {
  counts: Record<ErrorCategory, number>;
  documentTitle: string | null;
};

export function ProgressFilters({ counts, documentTitle }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const activeCategory = searchParams.get("category") ?? "";
  const documentId = searchParams.get("documentId") ?? "";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [router, pathname, searchParams],
  );

  const totalErrors = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3 mb-6">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {/* All chip */}
        <button
          type="button"
          onClick={() => updateParams({ category: "", documentId })}
          className={cn(
            "px-3 h-8 rounded-full transition-colors",
            !activeCategory
              ? "bg-foreground text-background font-medium"
              : "bg-surface text-muted-foreground hover:text-foreground border border-border/60",
          )}
        >
          All ({totalErrors})
        </button>

        {/* Category chips */}
        {CATEGORIES.map((cat) => {
          const c = counts[cat];
          if (c === 0 && !activeCategory) return null;
          const style = CATEGORY_STYLES[cat];
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() =>
                updateParams({ category: isActive ? "" : cat, documentId })
              }
              className={cn(
                "px-3 h-8 rounded-full transition-colors text-xs font-medium",
                isActive
                  ? style.chip + " ring-1 ring-current/30"
                  : "bg-surface text-muted-foreground hover:text-foreground border border-border/60",
              )}
            >
              {ERROR_TAXONOMY[cat].label} ({c})
            </button>
          );
        })}
      </div>

      {/* Document filter pill */}
      {documentId && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Filtered by document:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
            {documentTitle ?? "Document removed"}
            <button
              type="button"
              onClick={() => updateParams({ category: activeCategory, documentId: "" })}
              className="ml-0.5 hover:text-foreground transition-colors"
              aria-label="Remove document filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

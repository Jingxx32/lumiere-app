"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function TcfHeader() {
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") === "reading" ? "reading" : "listening";

  return (
    <header className="flex items-center justify-between border-b border-border/60 bg-background px-6 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.8} />
        <span className="font-serif text-lg font-semibold tracking-tight">
          TCF Canada
        </span>
      </div>

      <div className="inline-flex rounded-lg border border-border/70 bg-surface p-0.5">
        {(["listening", "reading"] as const).map((s) => (
          <Link
            key={s}
            href={`/tcf?skill=${s}`}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              s === skill
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "listening" ? "Écoute" : "Lecture"}
          </Link>
        ))}
      </div>

      <Link
        href="/library"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Lumière
      </Link>
    </header>
  );
}

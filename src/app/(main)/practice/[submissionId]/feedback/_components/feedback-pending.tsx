"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Shown while feedback generates in the background (after()); polls until the
 *  server component re-renders with feedback (status flips to ready/failed). */
export function FeedbackPending() {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-border bg-surface shadow-sm px-8 py-10 text-center space-y-4">
      <Loader2 className="h-6 w-6 animate-spin text-accent mx-auto" />
      <h2 className="font-serif text-xl font-semibold">Generating feedback…</h2>
      <p className="text-sm text-muted-foreground">
        Your writing is saved. The AI is analysing it — this usually takes 20–40
        seconds. This page updates automatically.
      </p>
    </div>
  );
}

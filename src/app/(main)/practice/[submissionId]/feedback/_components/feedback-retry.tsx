"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { regenerateFeedback } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";

export function FeedbackRetry({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleRetry() {
    setFailed(false);
    startTransition(async () => {
      const res = await regenerateFeedback(submissionId);
      if (res.ok) {
        router.refresh();
      } else {
        setFailed(true);
      }
    });
  }

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-border bg-surface shadow-sm px-8 py-10 text-center space-y-4">
      <h2 className="font-serif text-xl font-semibold">Feedback generation failed</h2>
      <p className="text-sm text-muted-foreground">
        Your writing is saved. The AI feedback didn&apos;t come through — this can
        happen on a timeout or rate limit. Try again.
      </p>
      <Button onClick={handleRetry} disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Retry feedback
          </>
        )}
      </Button>
      {failed && (
        <p className="text-xs text-danger">
          Still failing. Wait a moment and retry, or check your API key.
        </p>
      )}
    </div>
  );
}

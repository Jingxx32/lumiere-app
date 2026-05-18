"use client";

import { useState, useTransition } from "react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testApiKey } from "@/lib/actions/settings";

export function TestApiKeyButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleTest() {
    startTransition(async () => {
      const status = await testApiKey();
      setResult({
        ok: status.ok,
        message: status.ok ? "Connection verified successfully." : status.error,
      });
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={handleTest} disabled={isPending}>
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Testing…" : "Re-test connection"}
      </Button>
      {result && (
        <span className={`flex items-center gap-1 text-xs ${result.ok ? "text-success" : "text-danger"}`}>
          {result.ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {result.message}
        </span>
      )}
    </div>
  );
}

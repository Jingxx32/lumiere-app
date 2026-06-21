"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tcf-done-questions";

/**
 * Tracks which TCF questions the learner has "done" (revealed the answer for).
 * Persisted in localStorage, keyed by the global question id, so marks survive
 * reloads and span every test/level/skill. Single-user, browser-local by design.
 */
export function useDoneQuestions() {
  const [done, setDone] = useState<Set<string>>(new Set());

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore malformed storage
    }
  }, []);

  const markDone = useCallback((id: string) => {
    setDone((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore quota/availability errors
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDone(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { done, markDone, clearAll };
}

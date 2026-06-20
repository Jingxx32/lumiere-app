"use client";

import { useEffect } from "react";

export type TextSelection = { text: string; sentenceContext: string; rect: DOMRect };

export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  onSelect: (sel: TextSelection | null) => void,
  ignoreRef?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleMouseUp(e: MouseEvent) {
      if (ignoreRef?.current?.contains(e.target as Node)) return;
      const selection = window.getSelection();
      const raw = selection?.toString().trim();
      if (!raw || raw.length < 2 || raw.length > 80) {
        onSelect(null);
        return;
      }
      const text = raw.normalize("NFC");
      const range = selection!.getRangeAt(0);
      const container = range.startContainer;
      const block = (
        container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element)
      )?.closest("p, li, td, [data-selectable]");
      const sentenceContext = (block?.textContent ?? text).normalize("NFC");
      onSelect({ text, sentenceContext, rect: range.getBoundingClientRect() });
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSelect(null);
    }

    el.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKey);
    return () => {
      el.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKey);
    };
  }, [containerRef, onSelect, ignoreRef]);
}

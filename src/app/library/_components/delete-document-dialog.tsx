"use client";

import { useTransition } from "react";
import { deleteDocument } from "@/lib/actions/documents";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeleteDocumentDialog({
  id,
  title,
  sessionCount,
  open,
  onOpenChange,
}: {
  id: string;
  title: string;
  sessionCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteDocument(id);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete document?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{title}</span> will be
                permanently removed from your library. This cannot be undone.
              </p>
              {sessionCount > 0 && (
                <p>
                  {sessionCount} reading {sessionCount === 1 ? "session" : "sessions"} and any
                  vocabulary you looked up will be preserved in your history, but
                  unlinked from this document.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

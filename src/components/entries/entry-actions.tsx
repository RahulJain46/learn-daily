"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Loader2 } from "lucide-react";
import { deleteEntry } from "@/lib/actions/entries";

export function EntryActions({ entryId }: { entryId: string }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this entry? This will also delete all associated revision cards.")) {
      return;
    }
    setDeleting(true);
    await deleteEntry(entryId);
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="icon">
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="text-destructive"
        onClick={handleDelete}
        disabled={deleting}
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

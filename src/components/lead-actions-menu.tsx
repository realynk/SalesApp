"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubmitButton } from "@/components/forms";
import { archiveLead, deleteLeadPermanently, restoreLead } from "@/server/actions";
import { useCanWriteCrm } from "@/components/workspace-access";

export function LeadActionsMenu({
  leadId,
  name,
  archived,
}: {
  leadId: string;
  name: string;
  archived: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canWrite = useCanWriteCrm();
  if (!canWrite) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="size-4" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {archived ? (
            <form action={async (formData) => { await restoreLead(null, formData); }}>
              <input type="hidden" name="lead_id" value={leadId} />
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full text-left">Restore lead</button>
              </DropdownMenuItem>
            </form>
          ) : (
            <form action={async (formData) => { await archiveLead(null, formData); }}>
              <input type="hidden" name="lead_id" value={leadId} />
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full text-left">Archive</button>
              </DropdownMenuItem>
            </form>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {name} permanently?</DialogTitle>
            <DialogDescription>
              This cannot be undone. {name} and this lead’s opportunities, tasks, notes, and history will be removed from SalesApp.
              If this person still exists in SendPilot, they will not come back from a webhook or file import unless you recreate them on purpose from review.
            </DialogDescription>
          </DialogHeader>
          <form action={async (formData) => { await deleteLeadPermanently(null, formData); }} className="space-y-3">
            <input type="hidden" name="lead_id" value={leadId} />
            <label className="block text-sm">
              Type the lead name to confirm
              <input
                className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                name="confirm_name"
                required
                placeholder={name}
                autoComplete="off"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm_delete" value="yes" required className="mt-1" />
              I understand this cannot be undone.
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <SubmitButton variant="destructive">Delete permanently</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

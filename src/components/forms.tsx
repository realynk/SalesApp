"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/form";

export function SubmitButton({ children, variant = "default" }: { children: ReactNode; variant?: "default" | "outline" | "secondary" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {state?.error ? <p className="mb-3 text-sm text-destructive">{state.error}</p> : null}
      {state?.success ? <p className="mb-3 text-sm text-success">{state.success}</p> : null}
      {children}
    </form>
  );
}

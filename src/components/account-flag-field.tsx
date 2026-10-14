"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { controlClass } from "@/components/bits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ACCOUNT_FLAGS,
  ACCOUNT_FLAG_TONE,
  accountFlagIconClass,
  accountFlagLabel,
  type AccountFlag,
} from "@/lib/domain";
import { setAccountFlagFromBoard } from "@/server/actions";
import { useCanWriteCrm } from "@/components/workspace-access";

export function FlagBadge({ flag }: { flag: AccountFlag | null }) {
  if (!flag) return null;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${ACCOUNT_FLAG_TONE[flag]}`}>
      {flag}
    </span>
  );
}

export function AccountFlagButton({
  value,
  onChange,
}: {
  value: AccountFlag | null;
  onChange: (flag: AccountFlag | null) => void;
}) {
  const label = accountFlagLabel(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-muted"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Flag className={`size-3.5 ${accountFlagIconClass(value)}`} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-48 w-auto"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => onChange(null)}>No flag</DropdownMenuItem>
        {ACCOUNT_FLAGS.map((flag) => (
          <DropdownMenuItem key={flag} onSelect={() => onChange(flag)}>
            {flag}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccountFlagSelect({
  name = "account_flag",
  value,
  defaultValue,
  onChange,
  compact = false,
}: {
  name?: string;
  value?: AccountFlag | null;
  defaultValue?: AccountFlag | null;
  onChange?: (flag: AccountFlag | null) => void;
  compact?: boolean;
}) {
  const current = value === undefined ? undefined : value ?? "";
  return (
    <select
      className={compact ? `${controlClass} h-8 text-xs` : controlClass}
      name={name}
      value={current}
      defaultValue={current === undefined ? defaultValue ?? "" : undefined}
      aria-label="Account flag"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const next = event.target.value;
        onChange?.(ACCOUNT_FLAGS.includes(next as AccountFlag) ? next as AccountFlag : null);
      }}
    >
      <option value="">No flag</option>
      {ACCOUNT_FLAGS.map((flag) => (
        <option key={flag} value={flag}>{flag}</option>
      ))}
    </select>
  );
}

export function AccountFlagControl({
  leadId,
  opportunityId,
  value,
  compact = false,
}: {
  leadId: string;
  opportunityId?: string | null;
  value: AccountFlag | null;
  compact?: boolean;
}) {
  const [flag, setFlag] = useState<AccountFlag | null>(value);
  const [error, setError] = useState<string | null>(null);
  const canWrite = useCanWriteCrm();

  if (!canWrite) {
    return flag ? <FlagBadge flag={flag} /> : <span className="text-sm text-muted-foreground">No flag</span>;
  }

  async function persist(next: AccountFlag | null) {
    const previous = flag;
    setFlag(next);
    const formData = new FormData();
    formData.set("lead_id", leadId);
    if (opportunityId) formData.set("opportunity_id", opportunityId);
    formData.set("account_flag", next ?? "");
    const result = await setAccountFlagFromBoard(formData);
    if (result?.error) {
      setFlag(previous);
      setError(result.error);
      return;
    }
    setError(null);
  }

  return (
    <div>
      <AccountFlagSelect compact={compact} value={flag} onChange={persist} />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

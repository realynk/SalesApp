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
  DEFAULT_BOARD_ACCOUNT_FLAGS,
  accountFlag,
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
  flags = DEFAULT_BOARD_ACCOUNT_FLAGS,
}: {
  value: AccountFlag | null;
  onChange: (flag: AccountFlag | null) => void;
  flags?: readonly AccountFlag[];
}) {
  const label = accountFlagLabel(value);
  const options = flagMenuOptions(flags, value);
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
        <DropdownMenuItem onSelect={() => onChange(null)}>No Flag</DropdownMenuItem>
        {options.map((flag) => (
          <DropdownMenuItem key={flag} onSelect={() => onChange(flag)}>
            {flag}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function flagMenuOptions(flags: readonly AccountFlag[], current?: AccountFlag | null) {
  if (current && !flags.includes(current)) return [current, ...flags];
  return [...flags];
}

export function AccountFlagSelect({
  name = "account_flag",
  value,
  defaultValue,
  onChange,
  compact = false,
  flags = ACCOUNT_FLAGS,
}: {
  name?: string;
  value?: AccountFlag | null;
  defaultValue?: AccountFlag | null;
  onChange?: (flag: AccountFlag | null) => void;
  compact?: boolean;
  flags?: readonly AccountFlag[];
}) {
  const current = value === undefined ? undefined : value ?? "";
  const selected = value === undefined ? accountFlag(defaultValue ?? null) : value;
  const options = flagMenuOptions(flags, selected);
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
        onChange?.(accountFlag(next));
      }}
    >
      <option value="">No Flag</option>
      {options.map((flag) => (
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
  flags,
}: {
  leadId: string;
  opportunityId?: string | null;
  value: AccountFlag | null;
  compact?: boolean;
  flags?: readonly AccountFlag[];
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
      <AccountFlagSelect compact={compact} value={flag} flags={flags} onChange={persist} />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

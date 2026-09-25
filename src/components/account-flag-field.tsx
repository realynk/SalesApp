"use client";

import { useState } from "react";
import { controlClass } from "@/components/bits";
import { ACCOUNT_FLAGS, ACCOUNT_FLAG_TONE, type AccountFlag } from "@/lib/domain";
import { setAccountFlagFromBoard } from "@/server/actions";

export function FlagBadge({ flag }: { flag: AccountFlag | null }) {
  if (!flag) return null;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${ACCOUNT_FLAG_TONE[flag]}`}>
      {flag}
    </span>
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

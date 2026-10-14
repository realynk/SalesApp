export type OpenWorkItem = {
  title: string;
  dueOn: string | null;
  status?: string | null;
};

export function earliestOpenWorkItem(items: OpenWorkItem[]) {
  return items
    .filter((item) => (item.status ?? "open") === "open" && item.title.trim())
    .slice()
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.title.localeCompare(b.title))[0] ?? null;
}

export function resolveNextAction(input: {
  manual?: boolean;
  manualTitle?: string | null;
  manualDate?: string | null;
  openItems: OpenWorkItem[];
  fallbackTitle?: string | null;
  fallbackDate?: string | null;
}) {
  if (input.manual && input.manualTitle?.trim()) {
    return {
      title: input.manualTitle.trim(),
      dueOn: input.manualDate ?? null,
      source: "manual" as const,
    };
  }
  const earliest = earliestOpenWorkItem(input.openItems);
  if (earliest) {
    return { title: earliest.title, dueOn: earliest.dueOn, source: "task" as const };
  }
  if (input.fallbackTitle?.trim()) {
    return { title: input.fallbackTitle.trim(), dueOn: input.fallbackDate ?? null, source: "fallback" as const };
  }
  return { title: null, dueOn: null, source: "none" as const };
}

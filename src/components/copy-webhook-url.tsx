"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyWebhookUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="max-w-full truncate rounded-lg border border-border bg-muted px-2 py-1 text-xs">{url}</code>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy Webhook URL"}
      </Button>
    </div>
  );
}

import Link from "next/link";
import { PageHeader, StageBadge } from "@/components/bits";
import { searchWorkspace } from "@/lib/data";
import { firstParam } from "@/lib/format";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = firstParam((await searchParams).q) ?? "";
  const results = await searchWorkspace(query);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Search" title={query ? `Results for “${query}”` : "Search"} description="Contacts, companies, email, LinkedIn, and the client journey." />
      {query.length < 2 ? <p className="text-sm text-muted-foreground">Type at least two characters.</p> : null}
      <section>
        <h2 className="text-sm font-semibold">Leads</h2>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card px-4">
          {results.leads.map((lead) => (
            <li key={lead.id} className="py-3 text-sm">
              <Link className="font-medium" href={`/leads/${lead.id}`}>{lead.contactName}</Link>
              <p className="truncate text-muted-foreground">
                {[
                  lead.companyName && lead.companyName !== lead.contactName ? lead.companyName : null,
                  lead.email && lead.email !== lead.contactName ? lead.email : null,
                  lead.linkedinUrl,
                ].filter(Boolean).join(" · ") || "—"}
              </p>
            </li>
          ))}
          {query.length >= 2 && results.leads.length === 0 ? <li className="py-4 text-sm text-muted-foreground">No leads.</li> : null}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Client journey</h2>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card px-4">
          {results.opportunities.map((opportunity) => (
            <li key={opportunity.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <Link className="font-medium" href={`/opportunities/${opportunity.id}`}>{opportunity.contactName}</Link>
                {opportunity.companyName && opportunity.companyName !== opportunity.contactName ? (
                  <p className="truncate text-xs text-muted-foreground">{opportunity.companyName}</p>
                ) : null}
              </span>
              <StageBadge stage={opportunity.stage} />
            </li>
          ))}
          {query.length >= 2 && results.opportunities.length === 0 ? <li className="py-4 text-sm text-muted-foreground">No opportunities.</li> : null}
        </ul>
      </section>
    </div>
  );
}

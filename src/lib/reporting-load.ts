import { conversionRates, dateInTimeZone, timeMetrics, todayInTimeZone, type SendPilotStatus } from "@/lib/domain";
import { raiseIf } from "@/lib/errors";
import { getSettings } from "@/lib/data";
import { parseReportingTab, resolveReportingWindow } from "@/lib/reporting-duration";
import {
  buildReportingDashboard,
  fetchAllPages,
  type ReportingActivity,
  type ReportingFollowUp,
  type ReportingIdentity,
  type ReportingIntegration,
  type ReportingLead,
  type ReportingOpportunity,
  type ReportingStrategyCall,
} from "@/lib/reporting-metrics";
import { requireUser } from "@/server/session";

const PAGE_SIZE = 1000;

type Row = Record<string, unknown>;

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: unknown) {
  return value === true;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object") : [];
}

async function pagedSelect(
  table: string,
  columns: string,
  options: {
    order?: string;
    eq?: [string, string];
    in?: [string, string[]];
    notNull?: string;
  } = {},
): Promise<Row[]> {
  const { supabase } = await requireUser();
  return fetchAllPages(async (from, to) => {
    let query = supabase.from(table).select(columns).range(from, to);
    if (options.order) query = query.order(options.order, { ascending: true });
    if (options.order && options.order !== "id") query = query.order("id", { ascending: true });
    if (options.eq) query = query.eq(options.eq[0], options.eq[1]);
    if (options.in) query = query.in(options.in[0], options.in[1]);
    if (options.notNull) query = query.not(options.notNull, "is", null);
    const { data, error } = await query;
    raiseIf(error);
    return rows(data);
  }, PAGE_SIZE);
}

export async function getReportingDashboard(search: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const settings = await getSettings();
  const today = todayInTimeZone(settings.businessTimezone);
  const window = resolveReportingWindow({
    range: first(search.range),
    from: first(search.from),
    to: first(search.to),
    today,
  });
  const tab = parseReportingTab(first(search.tab));

  const [
    leadRows,
    opportunityRows,
    activityRows,
    identityRows,
    integrationRows,
    callRows,
    followRows,
    historyRows,
  ] = await Promise.all([
    pagedSelect("leads", "id, sendpilot_status, not_interested_outcome, archived_at, created_at", { order: "id" }),
    pagedSelect("opportunities", "id, lead_id, stage, status, next_action, next_action_date", { order: "id" }),
    pagedSelect(
      "activities",
      "id, lead_id, type, title, body, occurred_at, metadata",
      { order: "occurred_at", in: ["type", ["lead_became_interested", "sendpilot_status_changed", "profile_sent"]] },
    ),
    pagedSelect("sendpilot_lead_identities", "lead_id, integration_id", { notNull: "lead_id", order: "id" }),
    pagedSelect("sendpilot_integrations", "id, name, legacy_env", { order: "created_at" }),
    pagedSelect("strategy_calls", "id, opportunity_id, call_on, status", { order: "id" }),
    pagedSelect("follow_ups", "id, lead_id, title, due_on, status", { eq: ["status", "open"], order: "due_on" }),
    pagedSelect("pipeline_stage_history", "opportunity_id, new_stage, changed_at", { order: "changed_at" }),
  ]);

  const opportunityById = new Map(opportunityRows.map((row) => [String(row.id), row]));

  const leads: ReportingLead[] = leadRows.map((row) => ({
    id: String(row.id),
    sendpilotStatus: (str(row.sendpilot_status) as SendPilotStatus | null) ?? null,
    notInterestedOutcome: str(row.not_interested_outcome),
    archivedAt: str(row.archived_at),
    createdAt: str(row.created_at) ?? "",
  }));

  const opportunities: ReportingOpportunity[] = opportunityRows.map((row) => ({
    id: String(row.id),
    leadId: String(row.lead_id),
    stage: str(row.stage) ?? "",
    status: str(row.status) ?? "",
    nextAction: str(row.next_action),
    nextActionDate: str(row.next_action_date),
  }));

  const activities: ReportingActivity[] = activityRows
    .filter((row) => {
      const type = str(row.type);
      return type === "lead_became_interested" || type === "sendpilot_status_changed" || type === "profile_sent";
    })
    .map((row) => ({
      leadId: str(row.lead_id),
      type: str(row.type) ?? "",
      title: str(row.title) ?? "",
      body: str(row.body),
      occurredAt: str(row.occurred_at) ?? "",
      metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    }));

  const identities: ReportingIdentity[] = identityRows.flatMap((row) => {
    const leadId = str(row.lead_id);
    const integrationId = str(row.integration_id);
    return leadId && integrationId ? [{ leadId, integrationId }] : [];
  });

  const integrations: ReportingIntegration[] = integrationRows.map((row) => ({
    id: String(row.id),
    name: str(row.name) ?? "Untitled",
    legacyEnv: bool(row.legacy_env),
  }));

  const strategyCalls: ReportingStrategyCall[] = callRows.map((row) => {
    const opportunityId = String(row.opportunity_id);
    const opportunity = opportunityById.get(opportunityId);
    return {
      id: String(row.id),
      opportunityId,
      leadId: opportunity ? str(opportunity.lead_id) : null,
      callOn: str(row.call_on),
      status: str(row.status) ?? "",
    };
  });

  const followUps: ReportingFollowUp[] = followRows.map((row) => ({
    id: String(row.id),
    leadId: str(row.lead_id),
    title: str(row.title) ?? "Follow-up",
    dueOn: str(row.due_on) ?? "",
    status: str(row.status) ?? "open",
  }));

  const dashboard = buildReportingDashboard({
    window,
    timeZone: settings.businessTimezone,
    leads,
    opportunities,
    activities,
    identities,
    integrations,
    strategyCalls,
    followUps,
    stageEvents: [],
  });

  const stageEvents = historyRows
    .map((row) => ({
      opportunityId: String(row.opportunity_id),
      stage: str(row.new_stage) ?? "",
      at: str(row.changed_at) ?? "",
    }))
    .filter((event) => {
      const day = dateInTimeZone(event.at, settings.businessTimezone);
      if (!day) return false;
      if (window.startOn && day < window.startOn) return false;
      return day <= window.endOn;
    });

  return {
    tab,
    today,
    dashboard,
    journeyConversions: conversionRates(stageEvents),
    journeyDurations: timeMetrics(stageEvents),
  };
}

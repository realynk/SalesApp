import { cache } from "react";
import {
  buildAttention,
  dateInTimeZone,
  daysBetween,
  todayInTimeZone,
  conversionRates,
  timeMetrics,
  type OpportunityStage,
  type OpportunityStatus,
  type RiskLevel,
  type WaitingOn,
  type SendPilotStatus,
  notInterestedOutcome,
  accountFlag,
  type AccountFlag,
} from "@/lib/domain";
import { raiseIf } from "@/lib/errors";
import { fullName } from "@/lib/format";
import { requireUser } from "@/server/session";

type Row = Record<string, unknown>;

function row(value: unknown): Row | null {
  if (Array.isArray(value)) return row(value[0]);
  if (value && typeof value === "object") return value as Row;
  return null;
}

function rows(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter((item): item is Row => Boolean(item) && typeof item === "object");
  const single = row(value);
  return single ? [single] : [];
}

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bool(value: unknown) {
  return value === true;
}

export type Settings = {
  staleAfterDays: number;
  profilesWaitingDays: number;
  recruitmentTargetBusinessDays: number;
  approachingWindowDays: number;
  businessTimezone: string;
  sampleLoadedAt: string | null;
};

export type OpportunitySummary = {
  id: string;
  title: string;
  stage: OpportunityStage;
  status: OpportunityStatus;
  riskLevel: RiskLevel;
  waitingOn: WaitingOn;
  nextAction: string | null;
  nextActionDate: string | null;
  lastActivityAt: string | null;
  lastActivitySummary: string | null;
  headcount: number | null;
  billingRate: number | null;
  ownerId: string | null;
  ownerName: string | null;
  leadId: string;
  companyId: string;
  companyName: string;
  contactId: string;
  contactName: string;
  email: string | null;
  nurtureReason: string | null;
  nurtureNotes: string | null;
  lostReason: string | null;
  accountFlag: AccountFlag | null;
};

const DEFAULT_SETTINGS: Settings = {
  staleAfterDays: 10,
  profilesWaitingDays: 5,
  recruitmentTargetBusinessDays: 7,
  approachingWindowDays: 3,
  businessTimezone: "America/New_York",
  sampleLoadedAt: null,
};

function mapOpportunity(value: Row): OpportunitySummary {
  const company = row(value.companies);
  const contact = row(value.contacts);
  const owner = row(value.profiles);
  const headcount = num(value.headcount);
  const billingRate = num(value.billing_rate);
  return {
    id: String(value.id),
    title: str(value.title) ?? "Opportunity",
    stage: value.stage as OpportunityStage,
    status: value.status as OpportunityStatus,
    riskLevel: value.risk_level as RiskLevel,
    waitingOn: value.waiting_on as WaitingOn,
    nextAction: str(value.next_action),
    nextActionDate: str(value.next_action_date),
    lastActivityAt: str(value.last_activity_at),
    lastActivitySummary: str(value.last_activity_summary),
    headcount,
    billingRate,
    ownerId: str(value.owner_id),
    ownerName: str(owner?.full_name),
    leadId: String(value.lead_id),
    companyId: String(value.company_id),
    companyName: str(company?.name) ?? "Unknown company",
    contactId: String(value.contact_id),
    contactName: fullName(str(contact?.first_name), str(contact?.last_name)),
    email: str(contact?.email),
    nurtureReason: str(value.nurture_reason),
    nurtureNotes: str(value.nurture_notes),
    lostReason: str(value.lost_reason),
    accountFlag: accountFlag(str(value.account_flag)),
  };
}

const OPPORTUNITY_SELECT = `
  id, title, stage, status, risk_level, waiting_on, next_action, next_action_date,
  last_activity_at, last_activity_summary, headcount, billing_rate, owner_id, lead_id,
  company_id, contact_id, nurture_reason, nurture_notes, lost_reason, notes, account_flag, created_at,
  companies(id, name, industry, timezone, website, notes),
  contacts(id, first_name, last_name, email, phone, linkedin_url, title),
  profiles(id, full_name)
`;
const OPPORTUNITY_SELECT_FALLBACK = `
  id, title, stage, status, risk_level, waiting_on, next_action, next_action_date,
  last_activity_at, last_activity_summary, headcount, billing_rate, owner_id, lead_id,
  company_id, contact_id, nurture_reason, nurture_notes, lost_reason, notes, created_at,
  companies(id, name, industry, timezone, website, notes),
  contacts(id, first_name, last_name, email, phone, linkedin_url, title),
  profiles(id, full_name)
`;

export const getSettings = cache(async (): Promise<Settings> => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  raiseIf(error);
  if (!data) return DEFAULT_SETTINGS;
  const record = data as Row;
  return {
    staleAfterDays: num(record.stale_after_days) ?? DEFAULT_SETTINGS.staleAfterDays,
    profilesWaitingDays: num(record.profiles_waiting_days) ?? DEFAULT_SETTINGS.profilesWaitingDays,
    recruitmentTargetBusinessDays: num(record.recruitment_target_business_days) ?? DEFAULT_SETTINGS.recruitmentTargetBusinessDays,
    approachingWindowDays: num(record.approaching_window_days) ?? DEFAULT_SETTINGS.approachingWindowDays,
    businessTimezone: str(record.business_timezone) ?? DEFAULT_SETTINGS.businessTimezone,
    sampleLoadedAt: str(record.sample_loaded_at),
  };
});

export const getCommandCenter = cache(async () => {
  const { supabase, profile } = await requireUser();
  const settings = await getSettings();
  const today = todayInTimeZone(settings.businessTimezone);
  const [opportunityResult, followResult, batchResult, recruitmentResult, interviewResult, contractResult, callResult, leadResult, clientResult] =
    await Promise.all([
      supabase.from("opportunities").select(OPPORTUNITY_SELECT).limit(500),
      supabase.from("follow_ups").select("id, opportunity_id, lead_id, title, due_on, status, reason, notes").eq("status", "open").limit(300),
      supabase.from("profile_batches").select("id, opportunity_id, sent_on, profile_count, client_response, follow_up_on").limit(300),
      supabase.from("recruitment_requests").select("id, opportunity_id, status, target_on, company_name, urgent").limit(300),
      supabase.from("interviews").select("id, opportunity_id, candidate_name, client_name, interview_at, status").limit(300),
      supabase.from("contracts").select("opportunity_id, status, expected_start_on, sow_sent_on").limit(300),
      supabase.from("strategy_calls").select("opportunity_id, call_on, status, company_name").limit(300),
      supabase.from("leads").select("id, sendpilot_status, contacts(first_name, last_name), companies(name)").eq("sendpilot_status", "Interested").limit(500),
      supabase.from("clients").select("id, start_date").limit(300),
    ]);

  const loadedOpportunities = missingAccountFlagColumn(opportunityResult.error)
    ? await supabase.from("opportunities").select(OPPORTUNITY_SELECT_FALLBACK).limit(500)
    : opportunityResult;
  raiseIf(loadedOpportunities.error);
  raiseIf(followResult.error);
  raiseIf(batchResult.error);
  raiseIf(recruitmentResult.error);
  raiseIf(interviewResult.error);
  raiseIf(contractResult.error);
  raiseIf(callResult.error);
  raiseIf(leadResult.error);
  raiseIf(clientResult.error);

  const opportunities = rows(loadedOpportunities.data).map(mapOpportunity);
  const opportunityIds = new Set(opportunities.map((opportunity) => opportunity.leadId));
  const companyByOpportunity = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity.companyName]));

  const companyByLead = new Map<string, string>();
  for (const opportunity of opportunities) {
    companyByLead.set(opportunity.leadId, opportunity.companyName);
  }
  for (const item of rows(leadResult.data)) {
    const company = row(item.companies);
    const name = str(company?.name);
    if (name) companyByLead.set(String(item.id), name);
  }

  const followUps = rows(followResult.data).map((item) => {
    const opportunityId = str(item.opportunity_id);
    const leadId = str(item.lead_id);
    return {
      id: String(item.id),
      opportunityId,
      leadId,
      title: str(item.title) ?? "Follow-up",
      dueOn: str(item.due_on) ?? today,
      status: "open" as const,
      companyName:
        (opportunityId ? companyByOpportunity.get(opportunityId) : null) ??
        (leadId ? companyByLead.get(leadId) : null) ??
        "Follow-up",
    };
  });

  const profileBatches = rows(batchResult.data).map((item) => ({
    id: String(item.id),
    opportunityId: String(item.opportunity_id),
    companyName: companyByOpportunity.get(String(item.opportunity_id)) ?? "Client",
    sentOn: str(item.sent_on) ?? today,
    profileCount: num(item.profile_count) ?? 0,
    clientResponse: str(item.client_response),
    followUpOn: str(item.follow_up_on),
  }));

  const recruitment = rows(recruitmentResult.data).map((item) => ({
    id: String(item.id),
    opportunityId: String(item.opportunity_id),
    companyName: str(item.company_name) ?? companyByOpportunity.get(String(item.opportunity_id)) ?? "Recruitment",
    status: str(item.status) ?? "Not Started",
    targetOn: str(item.target_on) ?? today,
    urgent: bool(item.urgent),
  }));

  const interviews = rows(interviewResult.data).map((item) => ({
    id: String(item.id),
    opportunityId: String(item.opportunity_id),
    candidateName: str(item.candidate_name) ?? "Candidate",
    companyName: str(item.client_name) ?? companyByOpportunity.get(String(item.opportunity_id)) ?? "Client",
    interviewOn: dateInTimeZone(str(item.interview_at), settings.businessTimezone),
    status: str(item.status) ?? "Requested",
  }));

  const contracts = rows(contractResult.data).map((item) => ({
    opportunityId: String(item.opportunity_id),
    companyName: companyByOpportunity.get(String(item.opportunity_id)) ?? "Client",
    status: str(item.status) ?? "Preparing",
    expectedStartOn: str(item.expected_start_on),
  }));

  const strategyCalls = rows(callResult.data).map((item) => ({
    opportunityId: String(item.opportunity_id),
    companyName: str(item.company_name) ?? companyByOpportunity.get(String(item.opportunity_id)) ?? "Client",
    callOn: str(item.call_on),
    status: str(item.status) ?? "Draft",
  }));

  const unmatchedInterested = rows(leadResult.data)
    .filter((lead) => !opportunityIds.has(String(lead.id)))
    .map((lead) => {
      const contact = row(lead.contacts);
      const company = row(lead.companies);
      return {
        leadId: String(lead.id),
        name: fullName(str(contact?.first_name), str(contact?.last_name)),
        companyName: str(company?.name) ?? "Unknown company",
      };
    });

  const attention = buildAttention({
    today,
    staleAfterDays: settings.staleAfterDays,
    profilesWaitingDays: settings.profilesWaitingDays,
    approachingWindowDays: settings.approachingWindowDays,
    opportunities: opportunities.map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      companyName: opportunity.companyName,
      stage: opportunity.stage,
      status: opportunity.status,
      riskLevel: opportunity.riskLevel,
      waitingOn: opportunity.waitingOn,
      nextAction: opportunity.nextAction,
      nextActionDate: opportunity.nextActionDate,
      lastActivityOn: dateInTimeZone(opportunity.lastActivityAt, settings.businessTimezone),
    })),
    followUps,
    profileBatches,
    recruitment,
    interviews,
    contracts,
    strategyCalls,
    unmatchedInterested,
  });

  const weekStart = startOfWeek(today);
  const weekEnd = addDaysLocal(weekStart, 6);
  const month = today.slice(0, 7);
  const clients = rows(clientResult.data);
  const activeCount = opportunities.filter((item) => item.status === "active" || item.status === "nurture" || item.status === "on_hold").length;

  return {
    profile,
    settings,
    today,
    attention,
    opportunities,
    kpis: {
      activeOpportunities: activeCount,
      nurture: opportunities.filter((item) => item.status === "nurture").length,
      interestedLeads: rows(leadResult.data).length,
      interestedWithoutOpportunity: unmatchedInterested.length,
      profilesInReview: opportunities.filter((item) => item.stage === "Profiles Sent" || item.stage === "Client Review").length,
      meetingsThisWeek: strategyCalls.filter((call) => call.callOn && call.callOn >= weekStart && call.callOn <= weekEnd).length,
      recruitmentRequests: recruitment.filter((item) => !["Candidate Selected", "No Suitable Candidate"].includes(item.status)).length,
      profilesAwaiting: profileBatches.filter((batch) => !batch.clientResponse).length,
      interviews: interviews.filter((item) => ["Requested", "Scheduled", "Reschedule", "Additional Interview"].includes(item.status)).length,
      sowsPending: contracts.filter((item) => ["Preparing", "Sent", "Negotiating"].includes(item.status)).length,
      startsThisMonth:
        clients.filter((item) => str(item.start_date)?.startsWith(month)).length +
        contracts.filter((item) => item.expectedStartOn?.startsWith(month) && item.status !== "Cancelled").length,
    },
    schedule: {
      opportunities: opportunities.map((opportunity) => ({
        id: opportunity.id,
        title: opportunity.title,
        companyName: opportunity.companyName,
        stage: opportunity.stage,
        status: opportunity.status,
        riskLevel: opportunity.riskLevel,
        waitingOn: opportunity.waitingOn,
        nextAction: opportunity.nextAction,
        nextActionDate: opportunity.nextActionDate,
        lastActivityOn: dateInTimeZone(opportunity.lastActivityAt, settings.businessTimezone),
      })),
      followUps,
      profileBatches,
      recruitment,
      interviews,
      contracts,
      strategyCalls,
    },
    stale: opportunities.filter((opportunity) => {
      if (opportunity.status === "won" || opportunity.status === "lost") return false;
      if (opportunity.stage === "Won" || opportunity.stage === "Lost" || opportunity.stage === "Client Started") return false;
      const last = dateInTimeZone(opportunity.lastActivityAt, settings.businessTimezone);
      return last == null || daysBetween(last, today) >= settings.staleAfterDays;
    }),
  };
});

function startOfWeek(iso: string) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  return addDaysLocal(iso, -diff);
}

function addDaysLocal(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getOwners() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("profiles").select("id, full_name, email, role").order("full_name");
  raiseIf(error);
  return rows(data).map((item) => ({ id: String(item.id), name: str(item.full_name) ?? "User", email: str(item.email) ?? "" }));
}

export async function listLeads(filters: { q?: string; status?: string; review?: string }) {
  const { supabase } = await requireUser();
  const leadSelect =
    "id, source, sendpilot_status, sendpilot_status_raw, not_interested_outcome, account_flag, last_synced_at, requires_review, review_reason, created_at, company_id, contact_id, companies(id, name), contacts(id, first_name, last_name, email, phone, linkedin_url, title)";
  const leadSelectWithoutFlag =
    "id, source, sendpilot_status, sendpilot_status_raw, not_interested_outcome, last_synced_at, requires_review, review_reason, created_at, company_id, contact_id, companies(id, name), contacts(id, first_name, last_name, email, phone, linkedin_url, title)";
  const leadSelectFallback =
    "id, source, sendpilot_status, sendpilot_status_raw, last_synced_at, requires_review, review_reason, created_at, company_id, contact_id, companies(id, name), contacts(id, first_name, last_name, email, phone, linkedin_url, title)";
  const [firstLeadResult, opportunityResult, followResult] = await Promise.all([
    supabase.from("leads").select(leadSelect).order("updated_at", { ascending: false }).limit(500),
    supabase.from("opportunities").select("id, lead_id, stage, status").limit(500),
    supabase.from("follow_ups").select("id, lead_id, title, due_on, status").eq("status", "open").order("due_on").limit(500),
  ]);
  let leadResult: { data: unknown; error: { message?: string; code?: string } | null } = firstLeadResult;
  if (missingAccountFlagColumn(leadResult.error)) {
    leadResult = await supabase.from("leads").select(leadSelectWithoutFlag).order("updated_at", { ascending: false }).limit(500);
  }
  if (missingOutcomeColumn(leadResult.error)) {
    leadResult = await supabase.from("leads").select(leadSelectFallback).order("updated_at", { ascending: false }).limit(500);
  }
  raiseIf(leadResult.error);
  raiseIf(opportunityResult.error);
  raiseIf(followResult.error);
  const opportunityByLead = new Map(rows(opportunityResult.data).map((item) => [String(item.lead_id), item]));
  const nextFollowUpByLead = new Map<string, { title: string; dueOn: string }>();
  for (const item of rows(followResult.data)) {
    const leadId = str(item.lead_id);
    if (!leadId || nextFollowUpByLead.has(leadId)) continue;
    nextFollowUpByLead.set(leadId, { title: str(item.title) ?? "Follow-up", dueOn: str(item.due_on) ?? "" });
  }
  const query = filters.q?.trim().toLowerCase() ?? "";
  return rows(leadResult.data)
    .map((item) => {
      const company = row(item.companies);
      const contact = row(item.contacts);
      const opportunity = opportunityByLead.get(String(item.id));
      return {
        id: String(item.id),
        companyName: str(company?.name) ?? "Unknown company",
        contactName: fullName(str(contact?.first_name), str(contact?.last_name)),
        email: str(contact?.email),
        phone: str(contact?.phone),
        linkedinUrl: str(contact?.linkedin_url),
        title: str(contact?.title),
        source: str(item.source) ?? "sendpilot",
        sendpilotStatus: str(item.sendpilot_status) as SendPilotStatus | null,
        rawStatus: str(item.sendpilot_status_raw),
        lastSyncedAt: str(item.last_synced_at),
        requiresReview: bool(item.requires_review),
        reviewReason: str(item.review_reason),
        opportunityId: opportunity ? String(opportunity.id) : null,
        opportunityStage: opportunity ? (str(opportunity.stage) as OpportunityStage) : null,
        nextFollowUp: nextFollowUpByLead.get(String(item.id)) ?? null,
        notInterestedOutcome: notInterestedOutcome(str(item.not_interested_outcome)),
        accountFlag: accountFlag(str(item.account_flag)),
      };
    })
    .filter((lead) => {
      if (filters.status && lead.sendpilotStatus !== filters.status) return false;
      if (filters.review === "yes" && !lead.requiresReview) return false;
      if (filters.review === "missing" && lead.opportunityId) return false;
      if (!query) return true;
      return [lead.contactName, lead.companyName, lead.email, lead.linkedinUrl, lead.source].some((value) => value?.toLowerCase().includes(query));
    });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function missingOutcomeColumn(error: { message?: string; code?: string } | null) {
  return Boolean(error && (error.code === "PGRST204" || /not_interested_outcome/i.test(error.message ?? "")));
}

function missingAccountFlagColumn(error: { message?: string; code?: string } | null) {
  return Boolean(error && (error.code === "PGRST204" || /account_flag/i.test(error.message ?? "")));
}

export async function getLead(id: string) {
  if (!isUuid(id)) return null;
  const { supabase } = await requireUser();
  const detailSelect =
    "id, source, sendpilot_status, sendpilot_status_raw, not_interested_outcome, account_flag, last_synced_at, requires_review, review_reason, created_at, companies(id, name, industry, website, timezone, notes), contacts(id, first_name, last_name, email, phone, linkedin_url, title)";
  const detailWithoutFlag =
    "id, source, sendpilot_status, sendpilot_status_raw, not_interested_outcome, last_synced_at, requires_review, review_reason, created_at, companies(id, name, industry, website, timezone, notes), contacts(id, first_name, last_name, email, phone, linkedin_url, title)";
  const detailFallback =
    "id, source, sendpilot_status, sendpilot_status_raw, last_synced_at, requires_review, review_reason, created_at, companies(id, name, industry, website, timezone, notes), contacts(id, first_name, last_name, email, phone, linkedin_url, title)";
  const first = await supabase.from("leads").select(detailSelect).eq("id", id).maybeSingle();
  let loaded: { data: unknown; error: { message?: string; code?: string } | null } = first;
  if (missingAccountFlagColumn(first.error)) {
    loaded = await supabase.from("leads").select(detailWithoutFlag).eq("id", id).maybeSingle();
  }
  if (missingOutcomeColumn(loaded.error)) {
    loaded = await supabase.from("leads").select(detailFallback).eq("id", id).maybeSingle();
  }
  raiseIf(loaded.error);
  if (!loaded.data) return null;
  const record = loaded.data as Row;
  const company = row(record.companies);
  const contact = row(record.contacts);
  const [activities, opportunityResult, followUps, notes] = await Promise.all([
    supabase.from("activities").select("id, type, title, body, occurred_at").eq("lead_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("opportunities").select("id, stage, status, title, next_action, next_action_date").eq("lead_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("follow_ups").select("id, title, due_on, status, reason, notes, completed_at").eq("lead_id", id).order("due_on"),
    supabase.from("notes").select("id, body, created_at").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);
  raiseIf(activities.error);
  raiseIf(opportunityResult.error);
  raiseIf(followUps.error);
  raiseIf(notes.error);
  return {
    id,
    source: str(record.source) ?? "sendpilot",
    sendpilotStatus: str(record.sendpilot_status) as SendPilotStatus | null,
    rawStatus: str(record.sendpilot_status_raw),
    notInterestedOutcome: notInterestedOutcome(str(record.not_interested_outcome)),
    accountFlag: accountFlag(str(record.account_flag)),
    lastSyncedAt: str(record.last_synced_at),
    requiresReview: bool(record.requires_review),
    reviewReason: str(record.review_reason),
    createdAt: str(record.created_at),
    company: {
      id: str(company?.id),
      name: str(company?.name) ?? "Unknown company",
      industry: str(company?.industry),
      website: str(company?.website),
      timezone: str(company?.timezone),
      notes: str(company?.notes),
    },
    contact: {
      id: str(contact?.id),
      name: fullName(str(contact?.first_name), str(contact?.last_name)),
      email: str(contact?.email),
      phone: str(contact?.phone),
      linkedinUrl: str(contact?.linkedin_url),
      title: str(contact?.title),
    },
    opportunities: rows(opportunityResult.data).map((item) => ({
      id: String(item.id),
      stage: item.stage as OpportunityStage,
      status: str(item.status) ?? "active",
      title: str(item.title) ?? "Opportunity",
      nextAction: str(item.next_action),
      nextActionDate: str(item.next_action_date),
    })),
    activities: rows(activities.data).map(mapActivity),
    followUps: rows(followUps.data).map((item) => ({
      id: String(item.id),
      title: str(item.title) ?? "Follow-up",
      dueOn: str(item.due_on) ?? "",
      status: str(item.status) ?? "open",
      reason: str(item.reason),
      notes: str(item.notes),
      completedAt: str(item.completed_at),
    })),
    notes: rows(notes.data).map((item) => ({ id: String(item.id), body: str(item.body) ?? "", createdAt: str(item.created_at) })),
  };
}

function mapActivity(item: Row) {
  return {
    id: String(item.id),
    type: str(item.type) ?? "record_updated",
    title: str(item.title) ?? "Activity",
    body: str(item.body),
    occurredAt: str(item.occurred_at) ?? "",
  };
}

export async function listOpportunities(filters: { q?: string; stage?: string; risk?: string; owner?: string; waiting?: string }) {
  const { supabase } = await requireUser();
  const [center, leadResult] = await Promise.all([
    getCommandCenter(),
    supabase.from("leads").select("id, sendpilot_status").limit(500),
  ]);
  raiseIf(leadResult.error);
  const statusByLead = new Map(rows(leadResult.data).map((item) => [String(item.id), str(item.sendpilot_status)]));
  const query = filters.q?.trim().toLowerCase() ?? "";
  return center.opportunities.filter((opportunity) => {
    if (statusByLead.get(opportunity.leadId) === "Not Interested") return false;
    if (filters.stage && opportunity.stage !== filters.stage) return false;
    if (filters.risk && opportunity.riskLevel !== filters.risk) return false;
    if (filters.owner && opportunity.ownerId !== filters.owner) return false;
    if (filters.waiting && opportunity.waitingOn !== filters.waiting) return false;
    if (!query) return true;
    return [opportunity.companyName, opportunity.contactName, opportunity.email, opportunity.title, opportunity.nextAction]
      .some((value) => value?.toLowerCase().includes(query));
  });
}

export async function getOpportunity(id: string) {
  if (!isUuid(id)) return null;
  const { supabase } = await requireUser();
  const settings = await getSettings();
  const first = await supabase.from("opportunities").select(`${OPPORTUNITY_SELECT}, leads(id, sendpilot_status, source, last_synced_at)`).eq("id", id).maybeSingle();
  const loaded = missingAccountFlagColumn(first.error)
    ? await supabase.from("opportunities").select(`${OPPORTUNITY_SELECT_FALLBACK}, leads(id, sendpilot_status, source, last_synced_at)`).eq("id", id).maybeSingle()
    : first;
  raiseIf(loaded.error);
  if (!loaded.data) return null;
  const summary = mapOpportunity(loaded.data as Row);
  const lead = row((loaded.data as Row).leads);
  const [activities, history, followUps, strategy, recruitment, batches, interviews, contract, client, notes, documents, tasks] = await Promise.all([
    supabase.from("activities").select("id, type, title, body, occurred_at").or(`opportunity_id.eq.${id},lead_id.eq.${summary.leadId}`).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("pipeline_stage_history").select("id, previous_stage, new_stage, changed_at, note").eq("opportunity_id", id).order("changed_at", { ascending: false }),
    supabase.from("follow_ups").select("id, title, due_on, status, reason, notes, completed_at").eq("opportunity_id", id).order("due_on"),
    supabase.from("strategy_calls").select("*").eq("opportunity_id", id).maybeSingle(),
    supabase.from("recruitment_requests").select("*, candidates(*)").eq("opportunity_id", id).maybeSingle(),
    supabase.from("profile_batches").select("*, profile_batch_candidates(candidate_id)").eq("opportunity_id", id).order("sent_on", { ascending: false }),
    supabase.from("interviews").select("*").eq("opportunity_id", id).order("interview_at", { ascending: false }),
    supabase.from("contracts").select("*").eq("opportunity_id", id).maybeSingle(),
    supabase.from("clients").select("*").eq("opportunity_id", id).maybeSingle(),
    supabase.from("notes").select("id, body, created_at").eq("opportunity_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("id, name, storage_path, mime_type, size_bytes, created_at").eq("opportunity_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, title, details, status, due_on").eq("opportunity_id", id).order("created_at", { ascending: false }),
  ]);
  [activities, history, followUps, strategy, recruitment, batches, interviews, contract, client, notes, documents, tasks].forEach((result) => raiseIf(result.error));

  const documentRows = rows(documents.data);
  const signed = await Promise.all(
    documentRows.map(async (document) => {
      const path = str(document.storage_path);
      let url: string | null = null;
      if (path) {
        const { data: file } = await supabase.storage.from("opportunity-documents").createSignedUrl(path, 60 * 30);
        url = file?.signedUrl ?? null;
      }
      return {
        id: String(document.id),
        name: str(document.name) ?? "File",
        url,
        createdAt: str(document.created_at),
      };
    }),
  );

  return {
    ...summary,
    notesText: str((loaded.data as Row).notes),
    sendpilotStatus: str(lead?.sendpilot_status) as SendPilotStatus | null,
    sendpilotSource: str(lead?.source),
    lastSyncedAt: str(lead?.last_synced_at),
    today: todayInTimeZone(settings.businessTimezone),
    settings,
    activities: rows(activities.data).map(mapActivity),
    history: rows(history.data).map((item) => ({
      id: String(item.id),
      previousStage: str(item.previous_stage),
      newStage: str(item.new_stage) ?? "",
      changedAt: str(item.changed_at) ?? "",
      note: str(item.note),
    })),
    followUps: rows(followUps.data).map((item) => ({
      id: String(item.id),
      title: str(item.title) ?? "Follow-up",
      dueOn: str(item.due_on) ?? "",
      status: str(item.status) ?? "open",
      reason: str(item.reason),
      notes: str(item.notes),
      completedAt: str(item.completed_at),
    })),
    strategyCall: strategy.data ? (strategy.data as Row) : null,
    recruitment: recruitment.data ? (recruitment.data as Row) : null,
    candidates: rows(row(recruitment.data)?.candidates),
    batches: rows(batches.data),
    interviews: rows(interviews.data),
    contract: contract.data ? (contract.data as Row) : null,
    client: client.data ? (client.data as Row) : null,
    notes: rows(notes.data).map((item) => ({ id: String(item.id), body: str(item.body) ?? "", createdAt: str(item.created_at) })),
    documents: signed,
    tasks: rows(tasks.data).map((item) => ({
      id: String(item.id),
      title: str(item.title) ?? "Task",
      details: str(item.details),
      status: str(item.status) ?? "open",
      dueOn: str(item.due_on),
    })),
  };
}

export async function listFollowUps(status: string | undefined) {
  const { supabase } = await requireUser();
  let query = supabase.from("follow_ups").select("id, opportunity_id, lead_id, title, due_on, status, reason, notes, completed_at").order("due_on").limit(400);
  if (status === "open" || status === "completed" || status === "cancelled") query = query.eq("status", status);
  const { data, error } = await query;
  raiseIf(error);
  const center = await getCommandCenter();
  const names = new Map(center.opportunities.map((item) => [item.id, item.companyName]));
  return rows(data).map((item) => ({
    id: String(item.id),
    opportunityId: str(item.opportunity_id),
    leadId: str(item.lead_id),
    title: str(item.title) ?? "Follow-up",
    dueOn: str(item.due_on) ?? "",
    status: str(item.status) ?? "open",
    reason: str(item.reason),
    notes: str(item.notes),
    companyName: str(item.opportunity_id) ? names.get(String(item.opportunity_id)) ?? "Opportunity" : "Lead",
  }));
}

export async function listRecruitment() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("recruitment_requests").select("id, opportunity_id, status, target_on, urgent, company_name, client_name, headcount, sent_at").order("target_on").limit(300);
  raiseIf(error);
  return rows(data).map((item) => ({
    id: String(item.id),
    opportunityId: String(item.opportunity_id),
    status: str(item.status) ?? "Not Started",
    targetOn: str(item.target_on) ?? "",
    urgent: bool(item.urgent),
    companyName: str(item.company_name) ?? "Company",
    clientName: str(item.client_name),
    headcount: num(item.headcount),
  }));
}

export async function getRecruitment(id: string) {
  if (!isUuid(id)) return null;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("recruitment_requests").select("*, candidates(*), opportunities(id, title, stage, company_id, companies(name))").eq("id", id).maybeSingle();
  raiseIf(error);
  if (!data) return null;
  const record = data as Row;
  const candidateIds = rows(record.candidates).map((candidate) => String(candidate.id));
  const historyResult = candidateIds.length
    ? await supabase.from("candidate_status_history").select("id, candidate_id, previous_status, new_status, changed_at, note").in("candidate_id", candidateIds)
    : { data: [], error: null };
  raiseIf(historyResult.error);
  return { request: record, history: rows(historyResult.data) };
}

export async function getReconciliation() {
  const { supabase } = await requireUser();
  const [syncs, records, leads] = await Promise.all([
    supabase.from("sendpilot_syncs").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.from("sendpilot_records").select("*").eq("review_required", true).eq("applied", false).order("created_at", { ascending: false }).limit(100),
    listLeads({ review: "missing", status: "Interested" }),
  ]);
  raiseIf(syncs.error);
  raiseIf(records.error);
  return { syncs: rows(syncs.data), records: rows(records.data), missingOpportunities: leads };
}

export async function getAnalytics() {
  const { supabase } = await requireUser();
  const [leads, history, recruitment, batches, interviews, contracts, clients, opportunities] = await Promise.all([
    supabase.from("leads").select("sendpilot_status").limit(5000),
    supabase.from("pipeline_stage_history").select("opportunity_id, new_stage, changed_at").limit(8000),
    supabase.from("recruitment_requests").select("id", { count: "exact", head: true }),
    supabase.from("profile_batches").select("id", { count: "exact", head: true }),
    supabase.from("interviews").select("id", { count: "exact", head: true }),
    supabase.from("contracts").select("status"),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("opportunities").select("stage, status").limit(1000),
  ]);
  [leads, history, recruitment, batches, interviews, contracts, clients, opportunities].forEach((result) => raiseIf(result.error));
  const leadRows = rows(leads.data);
  const countStatus = (status: string) => leadRows.filter((lead) => lead.sendpilot_status === status).length;
  const opportunityRows = rows(opportunities.data);
  const events = rows(history.data).map((item) => ({
    opportunityId: String(item.opportunity_id),
    stage: String(item.new_stage),
    at: String(item.changed_at),
  }));
  const contractRows = rows(contracts.data);
  return {
    totalLeads: leadRows.length,
    interested: countStatus("Interested"),
    meetingsBooked: countStatus("Meeting Booked"),
    meetingsCompleted: countStatus("Meeting Complete"),
    recruitmentRequests: recruitment.count ?? 0,
    profilesSent: batches.count ?? 0,
    interviews: interviews.count ?? 0,
    clientsStarted: clients.count ?? 0,
    candidatesSelected: opportunityRows.filter((item) => ["Candidate Selected", "SOW Preparation", "SOW Sent", "SOW Negotiation", "SOW Signed", "Onboarding", "Client Started", "Won"].includes(String(item.stage))).length,
    sowsSent: contractRows.filter((item) => ["Sent", "Negotiating", "Signed"].includes(String(item.status))).length,
    sowsSigned: contractRows.filter((item) => item.status === "Signed").length,
    won: opportunityRows.filter((item) => item.stage === "Won").length,
    lost: opportunityRows.filter((item) => item.status === "lost").length,
    nurtured: opportunityRows.filter((item) => item.status === "nurture").length,
    strategyCalls: new Set(events.filter((event) => event.stage === "Strategy Call Complete" || event.stage === "Strategy Call Scheduled").map((event) => event.opportunityId)).size,
    conversions: conversionRates(events),
    durations: timeMetrics(events),
  };
}

export async function searchWorkspace(query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { leads: [], opportunities: [] };
  const [leads, opportunities] = await Promise.all([listLeads({ q }), listOpportunities({ q })]);
  return { leads: leads.slice(0, 20), opportunities: opportunities.slice(0, 20) };
}

export type InterestedOpportunityPlanInput = {
  sendpilotStatus: string | null | undefined;
  archived: boolean;
  existingOpportunityCount: number;
  possibleDuplicate?: boolean;
};

export type InterestedOpportunityPlan =
  | { action: "create" }
  | { action: "skip"; reason: "not_interested" | "wrong_status" | "archived" | "duplicate" | "possible_duplicate" };

export function planInterestedOpportunityCreate(input: InterestedOpportunityPlanInput): InterestedOpportunityPlan {
  if (input.possibleDuplicate) return { action: "skip", reason: "possible_duplicate" };
  if (input.archived) return { action: "skip", reason: "archived" };
  if (input.sendpilotStatus === "Not Interested") return { action: "skip", reason: "not_interested" };
  if (input.sendpilotStatus !== "Interested") return { action: "skip", reason: "wrong_status" };
  if (input.existingOpportunityCount > 0) return { action: "skip", reason: "duplicate" };
  return { action: "create" };
}

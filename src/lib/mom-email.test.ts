import assert from "node:assert/strict";
import test from "node:test";
import { emptyLiveSalesCallValues } from "./live-sales-call.ts";
import {
  buildMomEmail,
  estimatedMonthlyCost,
  firstNameFromContact,
  formatHourlyRate,
  momFactsFromLiveCall,
  nextFridayAfter,
  splitMomLines,
} from "./mom-email.ts";

test("first name is the greeting name", () => {
  assert.equal(firstNameFromContact("Chris Patel"), "Chris");
  assert.equal(firstNameFromContact("Xavier Brockman"), "Xavier");
});

test("Wednesday call asks for a decision by that Friday", () => {
  assert.equal(nextFridayAfter("2026-10-14"), "2026-10-16");
});

test("tasks split into email bullets", () => {
  const lines = splitMomLines(
    "Conduct outbound cold calls to prospective businesses.\nIntroduce ITAD services.\nIdentify opportunities and schedule meetings.",
  );
  assert.equal(lines.length, 3);
  assert.match(lines[0] ?? "", /cold calls/i);
});

test("part-time 20 hours/week at $8 estimates $640 per month", () => {
  assert.equal(formatHourlyRate("8"), "$8.00/hour");
  assert.equal(estimatedMonthlyCost("8", "Minimum of 20 hours per week per SDR"), "$640 (80 hours/month)");
});

test("MOM email matches the client recap shape", () => {
  const values = emptyLiveSalesCallValues();
  values.role = "Sales Development Representative (SDR) / Appointment Setter";
  values.headcount = "1";
  values.workArrangement = "Part-time SDRs";
  values.responsibilities = [
    "Conduct outbound cold calls to prospective businesses, including large corporations, hospitals, and school districts",
    "Introduce NextGen's IT asset disposition, electronics recycling, and equipment value recovery services",
    "Identify potential opportunities and schedule meetings with Chris or the appropriate sales representative",
    "Maintain daily activity reports and track outreach results",
  ].join("\n");
  values.billingRate = "8";
  values.schedule = "Minimum of 20 hours per week per SDR\nFlexible distribution of hours throughout the workweek";
  values.skills = [
    "Calling software/dialer - Client-provided",
    "Lead lists - Client-provided",
    "Calling scripts and service information - Client-provided",
    "Booking calendar - Client-provided",
  ].join("\n");
  values.startDate = "To be determined, pending internal discussion and approval.";
  values.callOn = "2026-10-14";
  const email = buildMomEmail(
    momFactsFromLiveCall(values, {
      contactName: "Chris",
      companyName: "NextGen ITAD",
      industry: "IT Asset Disposition (ITAD) / Electronics Recycling",
    }),
  );
  assert.match(email, /^Hi Chris,/);
  assert.match(email, /learning more about NextGen ITAD/);
  assert.match(email, /Industry: IT Asset Disposition/);
  assert.match(email, /Preferred Virtual Staff: Sales Development Representative/);
  assert.match(email, /List of Tasks:/);
  assert.match(email, /Conduct outbound cold calls/);
  assert.match(email, /Rate: \$8\.00\/hour/);
  assert.match(email, /Estimated Monthly Cost: \$640/);
  assert.match(email, /First week at no cost/);
  assert.match(email, /Month-to-month agreement/);
  assert.match(email, /Recruitment Timeline: Approximately 5 business days/);
  assert.match(email, /by Friday, October 16/);
  assert.match(email, /Thank you!$/);
  assert.doesNotMatch(email, /notes review and the talent request/i);
});

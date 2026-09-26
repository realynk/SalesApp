import assert from "node:assert/strict";
import test from "node:test";
import { identitiesOverlap, shouldRecreateDeletedLead, suppressionFingerprint } from "./suppress.ts";

test("matches SendPilot suppressions on the strongest identity available", () => {
  assert.equal(
    identitiesOverlap(
      { sendpilotLeadId: "lead_abc", email: "a@example.com" },
      { sendpilotLeadId: "lead_abc", email: "other@example.com" },
    ),
    true,
  );
  assert.equal(
    identitiesOverlap(
      { email: "Jane@Example.com" },
      { email: "jane@example.com", linkedinUrl: "https://www.linkedin.com/in/jane" },
    ),
    true,
  );
  assert.equal(
    identitiesOverlap(
      { linkedinUrl: "https://linkedin.com/in/jane/" },
      { linkedinUrl: "https://www.linkedin.com/in/jane" },
    ),
    true,
  );
  assert.equal(
    identitiesOverlap({ email: "a@example.com" }, { email: "b@example.com" }),
    false,
  );
  assert.deepEqual(suppressionFingerprint({ email: " A@x.com ", sendpilotLeadId: " lead_1 " }), {
    sendpilotLeadId: "lead_1",
    emailKey: "a@x.com",
    linkedinKey: null,
  });
});

test("does not recreate permanently deleted or archived SendPilot leads automatically", () => {
  assert.equal(shouldRecreateDeletedLead({ suppressed: true, existingLeadId: null }), false);
  assert.equal(shouldRecreateDeletedLead({ suppressed: false, archived: true, existingLeadId: "x" }), false);
  assert.equal(shouldRecreateDeletedLead({ suppressed: false, existingLeadId: "x" }), false);
  assert.equal(shouldRecreateDeletedLead({ suppressed: false, existingLeadId: null, archived: false }), true);
});

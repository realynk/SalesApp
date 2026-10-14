import assert from "node:assert/strict";
import test from "node:test";
import { SENDPILOT_UNIBOX_LINK, SENDPILOT_UNIBOX_URL } from "./app-links.ts";
import { storedLinkedInHref } from "../domain.ts";

test("Open SendPilot uses the verified Unibox URL and opens in a new tab", () => {
  assert.equal(SENDPILOT_UNIBOX_URL, "https://app.sendpilot.ai/dashboard/unibox");
  assert.equal(SENDPILOT_UNIBOX_LINK.href, SENDPILOT_UNIBOX_URL);
  assert.equal(SENDPILOT_UNIBOX_LINK.target, "_blank");
  assert.equal(SENDPILOT_UNIBOX_LINK.rel, "noopener noreferrer");
});

test("View LinkedIn still uses only the stored LinkedIn URL", () => {
  assert.equal(
    storedLinkedInHref("https://www.linkedin.com/in/marcus-dardin"),
    "https://www.linkedin.com/in/marcus-dardin",
  );
  assert.equal(storedLinkedInHref(null), null);
});

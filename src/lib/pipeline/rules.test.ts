import { describe, expect, it } from "vitest";
import { findQuote } from "./quotes";
import { ruleExtract, ruleLabelPairs, splitLines, topicFor } from "./rules";
import type { PChunk, PClaim, PPerson } from "./types";

const people: PPerson[] = [
  { id: "p1", name: "Riya Sharma", roleTitle: "Lead", email: null, handles: ["riya"] },
  { id: "p2", name: "Aman Gupta", roleTitle: "", email: null, handles: ["aman_g"] },
];
const chunk = (text: string, extra: Partial<PChunk> = {}): PChunk => ({
  id: "c1", sourceId: "s1", ordinal: 0, text, locator: "L1", author: "riya", timestamp: "2026-03-02T10:00:00Z", access: "TEAM", ...extra,
});

describe("rule-based extractor", () => {
  it("creates a DECISION with the exact line as the quote, owner and date", () => {
    const c = chunk("Weekly sync notes\nFinal: go with Razorpay for mess fee payments.\nThanks all");
    const out = ruleExtract([c], people);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("DECISION");
    expect(out[0].topicKey).toBe("payment_gateway");
    expect(out[0].owner).toBe("Riya Sharma");
    expect(out[0].date).toBe("2026-03-02");
    expect(out[0].isInference).toBe(false);
    expect(findQuote(c.text, out[0].evidence[0].quote)).not.toBeNull();
  });

  it("classifies TASK, RISK, DEPENDENCY and QUESTION lines", () => {
    const c = chunk(
      "- [ ] update the menu import script\nThe build fails on Windows again\nSMS alerts depend on the vendor dashboard; waiting on approval\nWho owns the prod database password?",
    );
    const types = ruleExtract([c], people).map((x) => x.type);
    expect(types).toEqual(["TASK", "RISK", "DEPENDENCY", "QUESTION"]);
  });

  it("detects CONTACT lines that name a person", () => {
    const out = ruleExtract([chunk("For the caterer, contact Aman before Friday.")], people);
    expect(out[0].type).toBe("CONTACT");
    expect(out[0].checklistKeys).toEqual(["key_contacts"]);
  });

  it("dedupes near-identical lines and skips redacted or plain lines", () => {
    const out = ruleExtract(
      [chunk("Build fails on Windows.\nbuild FAILS on windows\nkey is [REDACTED:SECRET-1] decided\nlunch was nice today")],
      people,
    );
    expect(out).toHaveLength(1);
  });

  it("splits long paragraphs into sentences that are exact substrings", () => {
    const long = `${"Context about the mess committee and the semester plan. ".repeat(4)}We decided to switch billing to monthly cycles. More words follow here.`;
    const lines = splitLines(long);
    expect(lines.every((l) => long.includes(l))).toBe(true);
    const out = ruleExtract([chunk(long)], people);
    expect(out.some((c) => c.type === "DECISION" && c.topicKey === "billing")).toBe(true);
  });

  it("titles are at most ~8 words and topics fall back to a keyword", () => {
    const out = ruleExtract([chunk("We need to finalise the hostel allocation sheet with the warden this week")], people);
    expect(out[0].title.split(" ").length).toBeLessThanOrEqual(8);
    expect(topicFor("hostel allocation sheet")).toBe("misc_hostel");
  });

  it("labels two different decisions on one topic as CONTRADICTS", () => {
    const mk = (id: string, statement: string, type: PClaim["type"] = "DECISION") => ({ id, type, statement }) as PClaim;
    const labels = ruleLabelPairs([
      { topicKey: "payment_gateway", a: mk("a", "Final: go with Razorpay"), b: mk("b", "Going with PhonePe") },
      { topicKey: "payment_gateway", a: mk("a", "Final: go with Razorpay"), b: mk("c", "PhonePe bug", "RISK") },
    ]);
    expect(labels).toEqual([expect.objectContaining({ pair: 0, label: "CONTRADICTS" })]);
  });
});

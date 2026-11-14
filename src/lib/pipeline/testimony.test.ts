import { describe, expect, it } from "vitest";
import { findQuote } from "./quotes";
import { fallbackTitle, pickQuote, settleByTokens } from "./testimony";

const A = "Registrations close 25 April, 11:59 pm. Approved notes 14-Mar and the site countdown.";
const B = "Registrations close 28 April (public announcement on #general).";

describe("settleByTokens", () => {
  it("reads the verdict from the first sentence, numbers included", () => {
    expect(settleByTokens(A, B, "Registrations close on 28 April. Please set the env var to 28 April 23:59 IST.")).toBe("B");
    expect(settleByTokens(A, B, "It is 25 April, the countdown is right.")).toBe("A");
  });

  it("respects negation and returns UNCLEAR when the answer does not pick a side", () => {
    expect(settleByTokens("Go with Razorpay", "Testing PhonePe", "Not Razorpay. Use PhonePe.")).toBe("B");
    expect(settleByTokens(A, B, "I am not sure, ask Dev.")).toBe("UNCLEAR");
  });
});

describe("pickQuote / fallbackTitle", () => {
  it("picks the first substantial sentence, which is always a verbatim span of the answer", () => {
    const answer = "Yes. The production database password is in the club vault. Ask Dev.";
    const q = pickQuote(answer);
    expect(q).toBe("The production database password is in the club vault.");
    expect(findQuote(`Q2: Who?\nA (Meera, 1 May): ${answer}`, q)).not.toBeNull();
  });

  it("skips sentences that are only redaction placeholders and caps the title", () => {
    expect(pickQuote("[REDACTED:SECRET-1]. Rotate the key every month please.")).toBe("Rotate the key every month please.");
    expect(fallbackTitle("x".repeat(20) + " " + "word ".repeat(40)).length).toBeLessThanOrEqual(90);
  });
});

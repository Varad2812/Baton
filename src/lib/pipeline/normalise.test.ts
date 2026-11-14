import { describe, expect, it } from "vitest";
import { buildIdentityMap, chunkSource, normaliseSources, Redactor, type RawSource } from "./normalise";
import { findQuote, normaliseForMatch, quoteIsValid } from "./quotes";

describe("quotes", () => {
  it("matches across whitespace, case and smart quotes, returning original offsets", () => {
    const text = "Meera said: “Final:   go with Razorpay” — lower fee.";
    const m = findQuote(text, '"final: go with razorpay"');
    expect(m).not.toBeNull();
    expect(text.slice(m!.start, m!.end)).toBe("“Final:   go with Razorpay”");
  });

  it("rejects paraphrases and too-short quotes", () => {
    expect(quoteIsValid("Final: go with Razorpay", "We chose Razorpay")).toBe(false);
    expect(quoteIsValid("Final: go with Razorpay", "go")).toBe(false);
  });

  it("normalises dashes and ellipses", () => {
    expect(normaliseForMatch("A – B…")).toBe("a - b...");
  });
});

describe("Redactor", () => {
  it("redacts the fake ffk_live_ secret, emails and phones; never keeps the value", () => {
    const r = new Redactor();
    const raw = "key ffk_live_9fK2mQ7xL4pR8sT1vW3y, mail meera@festflow.dev, call +91 98765 43210";
    const out = r.redact(raw, "Kabir Shah");
    expect(out.text).not.toContain("ffk_live_");
    expect(out.text).not.toContain("meera@festflow.dev");
    expect(out.text).not.toContain("98765");
    expect(out.redactions.map((x) => x.kind).sort()).toEqual(["EMAIL", "PHONE", "SECRET"]);
    expect(JSON.stringify(out.redactions)).not.toContain("9fK2mQ7");
    expect(out.redactions[0].mentionedBy).toBe("Kabir Shah");
  });

  it("redacts high-entropy KEY=value assignments but not low-entropy ones", () => {
    const r = new Redactor();
    expect(r.redact("RESEND_API_KEY=re_8hQ2kX9vLm3Pz7Tn4Wc1", null).text).toContain("[REDACTED:SECRET-1]");
    expect(r.redact("FEATURE_TOKEN=aaaaaaaaaaaaaaaaaaaa", null).text).toContain("aaaaaaaa");
  });

  it("reuses one placeholder for a repeated value", () => {
    const r = new Redactor();
    const a = r.redact("ffk_live_ABCDEFGHIJKLmnop", null).text;
    const b = r.redact("again ffk_live_ABCDEFGHIJKLmnop", null).text;
    expect(a).toBe("[REDACTED:SECRET-1]");
    expect(b).toBe("again [REDACTED:SECRET-1]");
  });

  it("can continue numbering from existing redactions", () => {
    const r = new Redactor("red_x_", { SECRET: 3 });
    expect(r.redact("ffk_live_ABCDEFGHIJKLmnop", null).text).toBe("[REDACTED:SECRET-4]");
  });
});

describe("chunkSource", () => {
  const src: RawSource = {
    key: "src_chat_dev",
    kind: "CHAT",
    title: "Discord #dev",
    access: "TEAM",
    authoritative: false,
    createdAt: new Date("2026-03-12"),
    mergeItems: true,
    items: Array.from({ length: 30 }, (_, i) => ({
      text: `[2026-03-12 10:${String(i).padStart(2, "0")}] @meera-k: message number ${i} with some padding text to fill`,
      locator: `#dev msg ${i + 1}`,
      pos: { label: "#dev msg", from: String(i + 1), to: String(i + 1) },
      author: "meera-k",
    })),
  };

  it("merges items into ~800-char chunks with ranged locators and inherited access", () => {
    const identity = buildIdentityMap([{ key: "meera", name: "Meera Kulkarni", handles: ["meera-k"] }]);
    const chunks = chunkSource(src, new Redactor(), identity, (k, i) => `${k}_${i}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(900);
      expect(c.access).toBe("TEAM");
      expect(c.author).toBe("Meera Kulkarni");
    }
    expect(chunks[0].locator).toMatch(/^#dev msg 1–\d+$/);
  });

  it("normaliseSources gives deterministic chk_ ids", () => {
    const { chunks } = normaliseSources([src], []);
    expect(chunks[0].id).toBe("chk_chat_dev_0");
  });
});

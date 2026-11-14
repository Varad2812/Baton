import { describe, expect, it } from "vitest";
import { batchChunks } from "./extract";
import { counterIds } from "./ids";
import { chunk, src } from "./test-helpers";
import type { PPerson } from "./types";
import { applyCanonical, validateExtracted, type RawExtracted } from "./validate";

const text = "Final: go with Razorpay, lower setup fee. Dev to start KYC.";
const chunks = new Map([
  ["c1", chunk("c1", "s1", text)],
  ["c2", chunk("c2", "s2", "PhonePe trial creds came today, testing this week")],
  ["cr", chunk("cr", "s3", "Sponsor CANARY row", { access: "RESTRICTED" })],
]);
const people: PPerson[] = [{ id: "per_dev", name: "Dev Patil", roleTitle: "", email: null, handles: ["devp"] }];

const raw = (over: Partial<RawExtracted>): RawExtracted => ({
  type: "DECISION",
  title: "Razorpay chosen",
  statement: "s",
  topicKey: "Payment Gateway",
  section: "Decisions",
  checklistKeys: ["key_decisions"],
  owner: "devp",
  date: "2026-04-02",
  isInference: false,
  evidence: [],
  batchId: "b1",
  batchChunkIds: ["c1", "c2"],
  ...over,
});

describe("validateExtracted", () => {
  it("keeps exact (normalised) quotes, stores the exact chunk slice and offsets", () => {
    const { claims, stats } = validateExtracted(
      [raw({ evidence: [{ chunkId: "c1", quote: "final:  GO with Razorpay", relation: "SUPPORTS" }] })],
      chunks,
      people,
      counterIds(),
    );
    expect(stats).toMatchObject({ rawQuotes: 1, validQuotes: 1, droppedQuotes: 0 });
    const e = claims[0].evidence[0];
    expect(e.quote).toBe("Final: go with Razorpay");
    expect(text.slice(e.matchStart!, e.matchEnd!)).toBe(e.quote);
    expect(claims[0]).toMatchObject({ topicKey: "payment_gateway", ownerPersonId: "per_dev", date: "2026-04-02" });
  });

  it("drops paraphrased quotes and quotes citing a chunk outside the batch", () => {
    const { claims, stats } = validateExtracted(
      [
        raw({
          evidence: [
            { chunkId: "c1", quote: "We decided to use Razorpay", relation: "SUPPORTS" },
            { chunkId: "cr", quote: "Sponsor CANARY row", relation: "SUPPORTS" },
            { chunkId: "c2", quote: "PhonePe trial creds came today", relation: "SUPPORTS" },
          ],
        }),
      ],
      chunks,
      people,
      counterIds(),
    );
    expect(stats).toMatchObject({ rawQuotes: 3, validQuotes: 1, droppedQuotes: 2 });
    expect(claims[0].evidence.map((e) => e.chunkId)).toEqual(["c2"]);
  });

  it("discards a non-inference claim with no valid evidence; keeps an inference as INFERRED-to-be", () => {
    const bad = [{ chunkId: "c1", quote: "not in the text at all", relation: "SUPPORTS" as const }];
    const { claims, stats } = validateExtracted(
      [raw({ evidence: bad }), raw({ title: "inferred", isInference: true, evidence: bad, batchChunkIds: ["cr"] })],
      chunks,
      people,
      counterIds(),
    );
    expect(stats.discardedClaims).toBe(1);
    expect(claims).toHaveLength(1);
    expect(claims[0].isInference).toBe(true);
    // Evidence-less inference inherits the batch's most sensitive access level.
    expect(claims[0].access).toBe("RESTRICTED");
  });

  it("rejects invalid dates and unknown owners", () => {
    const { claims } = validateExtracted(
      [raw({ date: "12 March", owner: "someone", evidence: [{ chunkId: "c1", quote: "lower setup fee", relation: "SUPPORTS" }] })],
      chunks,
      people,
      counterIds(),
    );
    expect(claims[0].date).toBeNull();
    expect(claims[0].ownerPersonId).toBeNull();
  });
});

describe("applyCanonical", () => {
  it("renames topics and merges sameAs duplicates by unioning evidence", () => {
    const { claims } = validateExtracted(
      [
        raw({ topicKey: "payments", evidence: [{ chunkId: "c1", quote: "go with Razorpay", relation: "SUPPORTS" }] }),
        raw({ topicKey: "gateway", evidence: [{ chunkId: "c2", quote: "PhonePe trial creds", relation: "SUPPORTS" }] }),
        raw({ topicKey: "other", type: "TASK", evidence: [{ chunkId: "c1", quote: "Dev to start KYC", relation: "SUPPORTS" }] }),
      ],
      chunks,
      people,
      counterIds(),
    );
    const out = applyCanonical(claims, [
      { topicKey: "payment_gateway", sameAs: -1 },
      { topicKey: "payment_gateway", sameAs: 0 },
      { topicKey: "kyc", sameAs: -1 },
    ]);
    expect(out.merged).toBe(1);
    expect(out.claims).toHaveLength(2);
    expect(out.claims[0].evidence.map((e) => e.chunkId)).toEqual(["c1", "c2"]);
    expect(out.claims[1].topicKey).toBe("kyc");
  });
});

describe("batchChunks", () => {
  it("never mixes RESTRICTED chunks with others, skips testimony, respects the size cap", () => {
    const sources = [
      src("doc", { kind: "DOC" }),
      src("budget", { kind: "DOC", access: "RESTRICTED" }),
      src("t", { kind: "TESTIMONY" }),
      src("dev", { kind: "CHAT" }),
    ];
    const cs = [
      chunk("d1", "doc", "a".repeat(600)),
      chunk("d2", "doc", "b".repeat(600)),
      chunk("r1", "budget", "c".repeat(100), { access: "RESTRICTED" }),
      chunk("t1", "t", "testimony"),
      chunk("m1", "dev", "d".repeat(100)),
    ];
    const batches = batchChunks(cs, sources, 1000);
    const restricted = batches.filter((b) => b.restricted);
    expect(restricted).toHaveLength(1);
    expect(restricted[0].chunkIds).toEqual(["r1"]);
    expect(batches.flatMap((b) => b.chunkIds)).not.toContain("t1");
    expect(batches.find((b) => b.chunkIds.includes("d1"))!.chunkIds).not.toContain("d2");
    for (const b of batches.filter((x) => !x.restricted)) expect(b.chunkIds).not.toContain("r1");
  });
});

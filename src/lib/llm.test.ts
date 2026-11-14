import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  cacheKey,
  createLlmCtx,
  llmJson,
  LlmBudgetError,
  LlmTimeoutError,
  LlmInvalidOutputError,
  LlmUnavailableError,
  memoryCache,
  toModelSchema,
  type LlmTransport,
} from "./llm";

const Schema = z.object({ answer: z.string(), n: z.number() });
const spec = { name: "t", system: "sys", prompt: "p", schema: Schema };
const noSleep = async () => {};
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

function fake(responses: (string | Error)[]) {
  const calls: string[] = [];
  const transport: LlmTransport = async (req) => {
    calls.push(req.prompt);
    const r = responses.shift();
    if (r === undefined) throw new Error("no more responses");
    if (r instanceof Error) throw r;
    return r;
  };
  return { transport, calls };
}

describe("llmJson", () => {
  it("serves a cache hit without a key and without spending budget", async () => {
    const cache = memoryCache();
    const key = cacheKey("m", "sys", "p", toModelSchema(Schema));
    await cache.set(key, { answer: "cached", n: 1 });
    const ctx = createLlmCtx({ model: "m", cache, transport: null, sleep: noSleep });
    await expect(llmJson(spec, ctx)).resolves.toEqual({ answer: "cached", n: 1 });
    expect(ctx.used).toBe(0);
    expect(ctx.calls[0].cached).toBe(true);
  });

  it("throws LlmUnavailableError on a cache miss with no key", async () => {
    const ctx = createLlmCtx({ model: "m", cache: memoryCache(), transport: null, sleep: noSleep });
    await expect(llmJson(spec, ctx)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("validates, caches and then reuses a live answer", async () => {
    const { transport, calls } = fake(['{"answer":"live","n":2}']);
    const ctx = createLlmCtx({ model: "m", cache: memoryCache(), transport, sleep: noSleep });
    await expect(llmJson(spec, ctx)).resolves.toEqual({ answer: "live", n: 2 });
    await expect(llmJson(spec, ctx)).resolves.toEqual({ answer: "live", n: 2 });
    expect(calls).toHaveLength(1);
    expect(ctx.used).toBe(1);
  });

  it("retries 429 and 5xx with backoff, then succeeds", async () => {
    const waits: number[] = [];
    const { transport, calls } = fake([httpError(429), httpError(503), '{"answer":"ok","n":3}']);
    const ctx = createLlmCtx({
      model: "m",
      cache: memoryCache(),
      transport,
      sleep: async (ms) => void waits.push(ms),
    });
    await expect(llmJson(spec, ctx)).resolves.toEqual({ answer: "ok", n: 3 });
    expect(calls).toHaveLength(3);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(ctx.used).toBe(1); // retries are one budgeted call
  });

  it("gives up after 3 retries with LlmUnavailableError", async () => {
    const { transport, calls } = fake([httpError(500), httpError(500), httpError(500), httpError(500), httpError(500)]);
    const ctx = createLlmCtx({ model: "m", cache: memoryCache(), transport, sleep: noSleep });
    await expect(llmJson(spec, ctx)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(calls).toHaveLength(4);
  });

  it("does not retry a 400, and reports it as unavailable (so callers fall back)", async () => {
    const { transport, calls } = fake([httpError(400)]);
    const ctx = createLlmCtx({ model: "m", cache: memoryCache(), transport, sleep: noSleep });
    const err = await llmJson(spec, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect(err.message).toContain("returned 400");
    expect(calls).toHaveLength(1);
  });

  it("an invalid key (401) is unavailable, not retried", async () => {
    const { transport, calls } = fake([httpError(401)]);
    const ctx = createLlmCtx({ model: "m", cache: memoryCache(), transport, sleep: noSleep });
    await expect(llmJson(spec, ctx)).rejects.toThrow(/rejected the API key/);
    expect(calls).toHaveLength(1);
  });

  it("enforces the per-run budget", async () => {
    const { transport } = fake(['{"answer":"a","n":1}', '{"answer":"b","n":2}']);
    const ctx = createLlmCtx({ model: "m", cache: memoryCache(), transport, sleep: noSleep, budget: 1 });
    await llmJson(spec, ctx);
    await expect(llmJson({ ...spec, prompt: "other" }, ctx)).rejects.toBeInstanceOf(LlmBudgetError);
  });

  it("repairs once on schema failure, then throws LlmInvalidOutputError", async () => {
    const ok = fake(['{"answer":1}', '{"answer":"fixed","n":1}']);
    const ctx1 = createLlmCtx({ model: "m", cache: memoryCache(), transport: ok.transport, sleep: noSleep });
    await expect(llmJson(spec, ctx1)).resolves.toEqual({ answer: "fixed", n: 1 });
    expect(ok.calls[1]).toContain("previous answer was invalid");

    const bad = fake(["not json", '{"nope":true}']);
    const ctx2 = createLlmCtx({ model: "m", cache: memoryCache(), transport: bad.transport, sleep: noSleep });
    await expect(llmJson(spec, ctx2)).rejects.toBeInstanceOf(LlmInvalidOutputError);
  });

  it("keys the cache by model, prompt and schema", () => {
    const s = toModelSchema(Schema);
    expect(cacheKey("a", "s", "p", s)).not.toBe(cacheKey("b", "s", "p", s));
    expect(cacheKey("a", "s", "p", s)).not.toBe(cacheKey("a", "s", "p2", s));
    expect(cacheKey("a", "s", "p", s)).not.toBe(cacheKey("a", "s", "p", toModelSchema(z.object({ x: z.string() }))));
  });

  it("times out a slow call as unavailable (no retry) and fails the rest of the run fast", async () => {
    let calls = 0;
    const slow: LlmTransport = () => {
      calls++;
      return new Promise(() => {}); // never answers
    };
    const ctx = createLlmCtx({ model: "m", cache: memoryCache(), transport: slow, sleep: noSleep, timeoutMs: 20 });
    const err = await llmJson(spec, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(LlmTimeoutError);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    await expect(llmJson({ ...spec, prompt: "next" }, ctx)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(calls).toBe(1);
  });
});

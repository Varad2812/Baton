// The only door to Gemini. Every call:
//   1. is keyed by sha256(model + system + prompt + schema) and served from the cache first
//      (so cached results work with no API key at all),
//   2. counts against a per-run budget (network calls only; cache hits are free),
//   3. runs under a global concurrency limit of 2,
//   4. retries 429 / 5xx / network errors with exponential backoff (max 3 retries),
//   5. is validated with zod before anyone sees it.
// Uses the @google/genai Interactions API with a JSON-schema response_format.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_MODEL = "gemini-3.5-flash";
export const DEFAULT_BUDGET = 40;
/** Per-call limit. A slower answer counts as "model unavailable" and the run falls back to the cache. */
export const CALL_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const CONCURRENCY = 2;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

/** LLM_DISABLED=1 forces offline mode (cache + fallbacks only), whatever key .env holds. */
export function llmDisabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.LLM_DISABLED?.trim() ?? "");
}

function apiKey(): string | undefined {
  return llmDisabled() ? undefined : process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function hasGeminiKey(): boolean {
  return !!apiKey();
}

/* ------------------------------------------------------------------------- */
/* Errors                                                                     */
/* ------------------------------------------------------------------------- */

/** The model cannot be reached for this call (no key, budget spent, provider down). */
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class LlmBudgetError extends LlmUnavailableError {
  constructor(readonly budget: number) {
    super(`LLM call budget of ${budget} calls for this run is spent`);
    this.name = "LlmBudgetError";
  }
}

/** A single call took longer than the per-call timeout. */
export class LlmTimeoutError extends LlmUnavailableError {
  constructor(readonly timeoutMs: number) {
    super(`Gemini did not answer within ${Math.round(timeoutMs / 1000)} s`);
    this.name = "LlmTimeoutError";
  }
}

/** The model answered, but not with JSON matching the schema (after one repair attempt). */
export class LlmInvalidOutputError extends Error {
  constructor(
    readonly callName: string,
    readonly issues: string,
  ) {
    super(`LLM output for "${callName}" failed validation: ${issues}`);
    this.name = "LlmInvalidOutputError";
  }
}

/* ------------------------------------------------------------------------- */
/* Cache stores                                                               */
/* ------------------------------------------------------------------------- */

export type LlmCacheStore = {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
};

export function memoryCache(seed?: Map<string, unknown>): LlmCacheStore & { map: Map<string, unknown> } {
  const map = seed ?? new Map<string, unknown>();
  return {
    map,
    async get(k) {
      return map.get(k);
    },
    async set(k, v) {
      map.set(k, v);
    },
  };
}

/** One JSON file per key. Used by scripts (seed:pipeline) so they need no database. */
export function fileCache(dir: string): LlmCacheStore {
  return {
    async get(k) {
      const p = path.join(dir, `${k}.json`);
      if (!existsSync(p)) return undefined;
      try {
        return JSON.parse(readFileSync(p, "utf8"));
      } catch {
        return undefined;
      }
    },
    async set(k, v) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(v));
    },
  };
}

/** LlmCache table. Imported lazily so pure code and tests never touch the DB. */
export function dbCache(): LlmCacheStore {
  return {
    async get(k) {
      const { prisma } = await import("@/lib/db");
      const row = await prisma.llmCache.findUnique({ where: { key: k } });
      return row?.response ?? undefined;
    },
    async set(k, v) {
      const { prisma } = await import("@/lib/db");
      const response = v as object;
      await prisma.llmCache.upsert({
        where: { key: k },
        create: { key: k, response },
        update: { response },
      });
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Transport                                                                  */
/* ------------------------------------------------------------------------- */

export type LlmRequest = {
  model: string;
  system: string;
  prompt: string;
  jsonSchema: object;
  temperature: number;
};

/** Returns raw response text. Throws errors carrying `.status` for HTTP failures. */
export type LlmTransport = (req: LlmRequest) => Promise<string>;

type GenAiClient = {
  interactions: {
    create(params: Record<string, unknown>): Promise<{ output_text?: string }>;
  };
  models: {
    generateContent(params: Record<string, unknown>): Promise<{ text?: string }>;
  };
};

let clientPromise: Promise<GenAiClient> | null = null;
/** Set once the Interactions endpoint rejects a request shape; later calls go straight to generateContent. */
let useGenerateContent = false;

const statusFrom = (e: unknown) => (e as { status?: number })?.status;
const keyRejected = (e: unknown) => /API_KEY_INVALID|API key not valid/i.test(String((e as Error)?.message));

/**
 * Real Gemini transport, or null when GEMINI_API_KEY is not set.
 * Primary: Interactions API with a JSON-schema response_format (current docs).
 * Fallback: models.generateContent with responseJsonSchema, if the Interactions endpoint
 * rejects the request (400/404) for a reason other than the key.
 */
export function geminiTransport(): LlmTransport | null {
  const key = apiKey();
  if (!key) return null;
  return async (req) => {
    clientPromise ??= import("@google/genai").then(
      // The SDK timeout aborts the HTTP request itself; llmJson enforces CALL_TIMEOUT_MS on top.
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey: key, httpOptions: { timeout: CALL_TIMEOUT_MS + 5_000 } }) as unknown as GenAiClient,
    );
    const client = await clientPromise;

    const viaGenerateContent = async () => {
      const r = await client.models.generateContent({
        model: req.model,
        contents: req.prompt,
        config: {
          systemInstruction: req.system,
          temperature: req.temperature,
          responseMimeType: "application/json",
          responseJsonSchema: req.jsonSchema,
        },
      });
      if (!r.text) throw Object.assign(new Error("Empty response from model"), { status: 502 });
      return r.text;
    };

    if (useGenerateContent) return viaGenerateContent();
    try {
      const interaction = await client.interactions.create({
        model: req.model,
        input: req.prompt,
        system_instruction: req.system,
        response_format: { type: "text", mime_type: "application/json", schema: req.jsonSchema },
        generation_config: { temperature: req.temperature },
        store: false,
      });
      const text = interaction.output_text;
      if (!text) throw Object.assign(new Error("Empty response from model"), { status: 502 });
      return text;
    } catch (e) {
      const s = statusFrom(e);
      if (s !== 400 && s !== 404) throw e;
      try {
        const text = await viaGenerateContent();
        useGenerateContent = true;
        return text;
      } catch (e2) {
        // generateContent reports the real reason (e.g. an invalid key) more clearly.
        throw keyRejected(e2) ? Object.assign(new Error("Gemini rejected GEMINI_API_KEY (API_KEY_INVALID)"), { status: 401 }) : e2;
      }
    }
  };
}

/* ------------------------------------------------------------------------- */
/* Run context                                                                */
/* ------------------------------------------------------------------------- */

export type LlmCallRecord = { name: string; ms: number; cached: boolean; attempts: number };

export type LlmRunCtx = {
  model: string;
  budget: number;
  /** Network calls made so far in this run. */
  used: number;
  cache: LlmCacheStore;
  /** null = no key: cache hits still work, misses throw LlmUnavailableError. */
  transport: LlmTransport | null;
  calls: LlmCallRecord[];
  sleep: (ms: number) => Promise<void>;
  /** Per-call timeout in ms (default CALL_TIMEOUT_MS). */
  timeoutMs: number;
  /** Set when the provider rejected the key or timed out: later calls in this run fail fast. */
  dead?: string;
};

export function createLlmCtx(opts: Partial<Omit<LlmRunCtx, "used" | "calls">> = {}): LlmRunCtx {
  return {
    model: opts.model ?? geminiModel(),
    budget: opts.budget ?? DEFAULT_BUDGET,
    used: 0,
    cache: opts.cache ?? dbCache(),
    transport: opts.transport === undefined ? geminiTransport() : opts.transport,
    calls: [],
    sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    timeoutMs: opts.timeoutMs ?? CALL_TIMEOUT_MS,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LlmTimeoutError(ms)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/* ------------------------------------------------------------------------- */
/* Concurrency                                                                */
/* ------------------------------------------------------------------------- */

const g = globalThis as unknown as { __batonLlmSlots?: { active: number; queue: (() => void)[] } };
const slots = (g.__batonLlmSlots ??= { active: 0, queue: [] });

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (slots.active >= CONCURRENCY) {
    await new Promise<void>((resolve) => slots.queue.push(resolve));
  } else {
    slots.active++;
  }
  try {
    return await fn();
  } finally {
    const next = slots.queue.shift();
    if (next) next();
    else slots.active--;
  }
}

/* ------------------------------------------------------------------------- */
/* Call                                                                       */
/* ------------------------------------------------------------------------- */

export type LlmJsonSpec<T> = {
  /** Short call name for logs and run stats, e.g. "extract:batch-3". */
  name: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
};

export function cacheKey(model: string, system: string, prompt: string, jsonSchema: object): string {
  return createHash("sha256")
    .update(model)
    .update("\u0000")
    .update(system)
    .update("\u0000")
    .update(prompt)
    .update("\u0000")
    .update(JSON.stringify(jsonSchema))
    .digest("hex");
}

function statusOf(e: unknown): number | undefined {
  const s = (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
}

function isRetryable(e: unknown): boolean {
  const s = statusOf(e);
  if (s === undefined) return true; // network / unknown transport failure
  return s === 429 || s >= 500;
}

/** JSON schema sent to the model. Strips keys Gemini rejects. */
export function toModelSchema(schema: z.ZodType): object {
  const js = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === "$schema" || k === "additionalProperties") continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(js) as object;
}

function parseAndValidate<T>(
  raw: string,
  schema: z.ZodType<T>,
): { ok: true; value: T; json: unknown } | { ok: false; issues: string } {
  let json: unknown;
  try {
    // Tolerate a fenced block even though JSON mode should not produce one.
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    json = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, issues: `not JSON (${(e as Error).message})` };
  }
  const r = schema.safeParse(json);
  if (r.success) return { ok: true, value: r.data, json };
  return {
    ok: false,
    issues: r.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  };
}

async function networkCall(ctx: LlmRunCtx, req: LlmRequest): Promise<{ text: string; attempts: number }> {
  const transport = ctx.transport;
  if (!transport) throw new LlmUnavailableError("GEMINI_API_KEY is not set");
  if (ctx.dead) throw new LlmUnavailableError(ctx.dead);
  if (ctx.used >= ctx.budget) throw new LlmBudgetError(ctx.budget);
  let attempt = 0;
  let counted = false;
  for (;;) {
    try {
      const text = await withSlot(() => {
        // Queued calls re-check: the key may have been rejected while they waited for a slot.
        if (ctx.dead) throw new LlmUnavailableError(ctx.dead);
        if (!counted) {
          // Budget is counted when the call is actually dispatched (retries are the same call).
          if (ctx.used >= ctx.budget) throw new LlmBudgetError(ctx.budget);
          ctx.used++;
          counted = true;
        }
        return withTimeout(transport(req), ctx.timeoutMs);
      });
      return { text, attempts: attempt + 1 };
    } catch (e) {
      if (e instanceof LlmTimeoutError) {
        // A model this slow will not get faster within the run: fail the rest fast, fall back to the cache.
        ctx.dead = e.message;
        throw e;
      }
      if (e instanceof LlmUnavailableError) throw e;
      if (attempt >= MAX_RETRIES || !isRetryable(e)) {
        // Every provider failure (bad key, quota, outage, rejected request) means "no live model
        // for this call": callers fall back to the cache instead of breaking.
        const s = statusOf(e);
        const msg = (e as Error)?.message ?? String(e);
        if (s === 401 || s === 403) {
          ctx.dead = `Gemini rejected the API key (${s}): ${msg}`;
          throw new LlmUnavailableError(ctx.dead);
        }
        throw new LlmUnavailableError(
          `Gemini ${s ? `returned ${s}` : "unreachable"} after ${attempt + 1} attempt${attempt ? "s" : ""}: ${msg.slice(0, 300)}`,
        );
      }
      const backoff = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
      attempt++;
      await ctx.sleep(backoff);
    }
  }
}

/**
 * Structured JSON call. Cache first; then the network (subject to key + budget).
 * Throws LlmUnavailableError (incl. LlmBudgetError) or LlmInvalidOutputError.
 */
export async function llmJson<T>(spec: LlmJsonSpec<T>, ctx: LlmRunCtx): Promise<T> {
  const started = Date.now();
  const jsonSchema = toModelSchema(spec.schema);
  const key = cacheKey(ctx.model, spec.system, spec.prompt, jsonSchema);

  const cached = await ctx.cache.get(key).catch(() => undefined);
  if (cached !== undefined) {
    const r = spec.schema.safeParse(cached);
    if (r.success) {
      ctx.calls.push({ name: spec.name, ms: Date.now() - started, cached: true, attempts: 0 });
      return r.data;
    }
  }

  const req: LlmRequest = {
    model: ctx.model,
    system: spec.system,
    prompt: spec.prompt,
    jsonSchema,
    temperature: spec.temperature ?? 0.2,
  };

  let { text, attempts } = await networkCall(ctx, req);
  let parsed = parseAndValidate(text, spec.schema);
  if (!parsed.ok) {
    // One repair attempt: same request, plus the validation errors.
    const repair = await networkCall(ctx, {
      ...req,
      prompt: `${req.prompt}\n\nYour previous answer was invalid (${parsed.issues}). Return only JSON that matches the schema exactly.`,
    });
    text = repair.text;
    attempts += repair.attempts;
    parsed = parseAndValidate(text, spec.schema);
    if (!parsed.ok) throw new LlmInvalidOutputError(spec.name, parsed.issues);
  }

  // Cache the raw JSON (pre-transform) so a cache hit re-validates through the same schema.
  await ctx.cache.set(key, parsed.json).catch(() => undefined);
  ctx.calls.push({ name: spec.name, ms: Date.now() - started, cached: false, attempts });
  return parsed.value;
}

// Assistant engine chain: Groq first, then Gemini, then the offline engine. One attempt per engine
// (no retries; a 429 also benches that engine for a minute), 15 s per call, 1,500 output tokens,
// JSON validated with zod. Answers are cached in memory only (never in the DB): the conversation
// is not stored anywhere on the server.
import { z } from "zod";
import { cacheKey, geminiApiKey, geminiModel, groqApiKey, groqModel, isQuotaError, toModelSchema } from "@/lib/llm";

export const ASSISTANT_TIMEOUT_MS = 15_000;
export const ASSISTANT_MAX_TOKENS = 1_500;
const QUOTA_COOLDOWN_MS = 60_000;

export type EngineName = "groq" | "gemini" | "offline";

export type ChatRequest = { system: string; prompt: string; jsonSchema: object; maxTokens: number; temperature: number };
/** Returns raw JSON text. Throws an error with `.status` on HTTP failures. */
export type ChatTransport = (req: ChatRequest, signal: AbortSignal) => Promise<string>;
export type ChatEngine = { name: "groq" | "gemini"; model: string; transport: ChatTransport };

export type ChainResult<T> = { value: T; engine: EngineName; model: string | null; errors: string[] };

const g = globalThis as unknown as { __batonAssistant?: { cache: Map<string, unknown>; benched: Map<string, number> } };
const state = (g.__batonAssistant ??= { cache: new Map(), benched: new Map() });

/** Test hook: forget cached answers and benched engines. */
export function resetEngineState() {
  state.cache.clear();
  state.benched.clear();
}

function remember(key: string, value: unknown) {
  state.cache.set(key, value);
  if (state.cache.size > 300) state.cache.delete(state.cache.keys().next().value as string);
}

/** Groq OpenAI-compatible chat completions in JSON mode. */
export function groqChatTransport(key: string): ChatTransport {
  return async (req, signal) => {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: groqModel(),
        temperature: req.temperature,
        max_completion_tokens: req.maxTokens,
        response_format: { type: "json_object" },
        ...(/gpt-oss/.test(groqModel()) ? { reasoning_effort: "low" } : {}),
        messages: [
          { role: "system", content: `${req.system}\n\nRespond with one JSON object matching this JSON schema:\n${JSON.stringify(req.jsonSchema)}` },
          { role: "user", content: req.prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw Object.assign(new Error(`Groq ${res.status}: ${body.slice(0, 200)}`), { status: res.status });
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content;
    if (!text) throw Object.assign(new Error("Empty response from Groq"), { status: 502 });
    return text;
  };
}

/** Gemini generateContent with a JSON schema. */
export function geminiChatTransport(key: string): ChatTransport {
  let client: Promise<{ models: { generateContent(p: Record<string, unknown>): Promise<{ text?: string }> } }> | null = null;
  return async (req, signal) => {
    client ??= import("@google/genai").then(
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey: key, httpOptions: { timeout: ASSISTANT_TIMEOUT_MS } }) as never,
    );
    const r = await (await client).models.generateContent({
      model: geminiModel(),
      contents: req.prompt,
      config: {
        systemInstruction: req.system,
        temperature: req.temperature,
        maxOutputTokens: req.maxTokens,
        responseMimeType: "application/json",
        responseJsonSchema: req.jsonSchema,
        abortSignal: signal,
      },
    });
    if (!r.text) throw Object.assign(new Error("Empty response from Gemini"), { status: 502 });
    return r.text;
  };
}

/** Engines configured in this environment, in chain order (Groq, then Gemini). */
export function defaultEngines(): ChatEngine[] {
  const out: ChatEngine[] = [];
  const gk = groqApiKey();
  if (gk) out.push({ name: "groq", model: groqModel(), transport: groqChatTransport(gk) });
  const mk = geminiApiKey();
  if (mk) out.push({ name: "gemini", model: geminiModel(), transport: geminiChatTransport(mk) });
  return out;
}

function parseJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(t);
}

/**
 * Try each engine once, in order; the first valid answer wins. If none answers, `offline()` does.
 * Never throws for provider problems.
 */
export async function runChain<T>(opts: {
  engines: ChatEngine[];
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  offline: () => T | Promise<T>;
  timeoutMs?: number;
  temperature?: number;
  /** Skip every model (rate limit reached): straight to offline. */
  offlineOnly?: boolean;
}): Promise<ChainResult<T>> {
  const errors: string[] = [];
  const jsonSchema = toModelSchema(opts.schema);
  if (!opts.offlineOnly) {
    for (const e of opts.engines) {
      const benchedUntil = state.benched.get(e.name) ?? 0;
      if (benchedUntil > Date.now()) {
        errors.push(`${e.name}: rate limited, skipped`);
        continue;
      }
      const key = cacheKey(`assistant:${e.name}:${e.model}`, opts.system, opts.prompt, jsonSchema);
      const hit = state.cache.get(key);
      if (hit !== undefined) {
        const r = opts.schema.safeParse(hit);
        if (r.success) return { value: r.data, engine: e.name, model: e.model, errors };
      }
      const ac = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            ac.abort();
            reject(Object.assign(new Error(`${e.name} timed out`), { status: 504 }));
          }, opts.timeoutMs ?? ASSISTANT_TIMEOUT_MS);
        });
        const raw = await Promise.race([
          e.transport({ system: opts.system, prompt: opts.prompt, jsonSchema, maxTokens: ASSISTANT_MAX_TOKENS, temperature: opts.temperature ?? 0.2 }, ac.signal),
          timeout,
        ]);
        const json = parseJson(raw);
        const r = opts.schema.safeParse(json);
        if (!r.success) {
          errors.push(`${e.name}: invalid output`);
          continue;
        }
        remember(key, json);
        return { value: r.data, engine: e.name, model: e.model, errors };
      } catch (err) {
        if (isQuotaError(err)) state.benched.set(e.name, Date.now() + QUOTA_COOLDOWN_MS);
        errors.push(`${e.name}: ${((err as Error)?.message ?? String(err)).slice(0, 120)}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { value: await opts.offline(), engine: "offline", model: null, errors };
}

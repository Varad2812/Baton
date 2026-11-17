// Route-handler plumbing: error -> HTTP status mapping, JSON body parsing, project lookup.

import { ZodError, type z } from "zod";
import { ForbiddenError } from "@/lib/authz";
import { resolveProject } from "@/lib/sandbox";
import { errorFields, log } from "@/lib/log";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(what: string) {
    super(404, `${what} not found`);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = "BadRequestError";
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
    this.name = "ConflictError";
  }
}

/** Our schemas carry plain messages; zod's generic ones ("Invalid input: expected object") get a plain fallback. */
function friendlyIssue(msg: string | undefined): string {
  if (!msg || /^Invalid input|^Too (small|big)|^Expected|^Required$/i.test(msg)) return "Some fields are missing or in the wrong format. Check the form and try again.";
  return msg;
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ForbiddenError) {
    return Response.json({ ok: false, error: e.message, code: "FORBIDDEN" }, { status: 403 });
  }
  if (e instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: friendlyIssue(e.issues[0]?.message),
        code: "INVALID_INPUT",
        issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return Response.json(
      { ok: false, error: (e as Error).message, details: (e as HttpError).details },
      { status },
    );
  }
  if ((e as { code?: string })?.code === "P2025") {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  log("error", "unhandled route error", errorFields(e));
  return Response.json({ ok: false, error: "Something went wrong. Please retry." }, { status: 500 });
}

/** Run a handler, wrap its result as `{ ok: true, ...result }`, map errors. */
export async function handle<T extends object>(fn: () => Promise<T>, init?: ResponseInit): Promise<Response> {
  try {
    const data = await fn();
    return Response.json({ ok: true, ...data }, init);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new BadRequestError("Body must be JSON");
    }
  }
  return schema.parse(body);
}

export async function projectBySlug(slug: string) {
  const p = await resolveProject(slug);
  if (!p) throw new NotFoundError(`Project "${slug}"`);
  return p;
}

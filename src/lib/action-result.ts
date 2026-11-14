import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/authz";

export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; forbidden?: boolean; message: string };

export function okResult<T>(message: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

export function errorResult(e: unknown): ActionResult<never> {
  if (e instanceof ForbiddenError) return { ok: false, forbidden: true, message: e.message };
  if (e instanceof ZodError || (e && typeof e === "object" && "issues" in e && Array.isArray((e as ZodError).issues))) {
    const issue = (e as ZodError).issues[0];
    return { ok: false, message: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" };
  }
  // HttpError subclasses (NotFound / BadRequest / Conflict), PipelineBusyError, etc. carry a status.
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 600 && e instanceof Error) {
    return { ok: false, message: e.message };
  }
  if ((e as { code?: string })?.code === "P2025") return { ok: false, message: "Not found. Reload the page and retry." };
  console.error(e);
  return { ok: false, message: "Something went wrong. Please retry." };
}

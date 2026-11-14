import type { ZodError } from "zod";
import { ForbiddenError } from "@/lib/authz";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; pending?: boolean; forbidden?: boolean; message: string };

/** Placeholder result until the pipeline branch provides the real mutation. */
export function pendingResult(what: string): ActionResult {
  return {
    ok: false,
    pending: true,
    message: `${what} is wired to the pipeline branch and will work after merge. Nothing was changed.`,
  };
}

export function errorResult(e: unknown): ActionResult {
  if (e instanceof ForbiddenError) return { ok: false, forbidden: true, message: e.message };
  if (e && typeof e === "object" && "issues" in e) {
    const issue = (e as ZodError).issues[0];
    return { ok: false, message: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" };
  }
  console.error(e);
  return { ok: false, message: "Something went wrong. Please retry." };
}

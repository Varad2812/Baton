// Shared prelude for Server Actions: resolve the "Viewing as" actor and the project by slug.
// Permission checks stay in the lib functions (assertCan runs before any write or LLM call);
// actions also call assertCan up front so a forbidden request never touches the DB.
import { z } from "zod";
import { assertCan, getActor, type Action } from "@/lib/authz";
import { projectBySlug } from "@/lib/http";

export const Slug = z.string().trim().min(1).max(64);

export async function actionContext(slug: string, action?: Action) {
  const actor = await getActor();
  if (action) assertCan(actor, action);
  const project = await projectBySlug(Slug.parse(slug));
  return { actor, project };
}

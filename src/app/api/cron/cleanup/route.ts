import { cleanupExpired } from "@/lib/sandbox";
import { isAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Delete expired sandboxes and visitor projects. Auth: `Authorization: Bearer $ADMIN_TOKEN`. */
export async function GET(req: Request) {
  if (!isAdmin(req)) return Response.json({ ok: false, error: "Admin token required." }, { status: 401 });
  return Response.json({ ok: true, ...(await cleanupExpired()) });
}

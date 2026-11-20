"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { randomBytes, createHmac } from "node:crypto";
import { getVisitorId, serverSecret } from "@/lib/visitor";
import { actionContext } from "@/lib/server/action-context";
import { errorResult } from "@/lib/action-result";
import { googleDocId, importGoogleDoc } from "@/lib/connectors/drive";
import type { TeamResult } from "./team";

export async function connectDrive(slug: string, _: TeamResult, form: FormData): Promise<TeamResult> {
  let consent: URL;
  try {
    const {actor,project} = await actionContext(slug,"connect_sources");
    const link = String(form.get("link") ?? "");
    const id = googleDocId(link);
    if (form.get("access") !== "private") {
      const message = await importGoogleDoc(actor,project.id,link);
      refresh();
      return {message};
    }
    const client = process.env.GOOGLE_DRIVE_CLIENT_ID;
    if (!client || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.NEXT_PUBLIC_APP_URL)
      return {message:"Private import is not configured. Upload the document export instead."};
    const vid = await getVisitorId();
    if (!vid) return {message:"Reload the project to start your session."};
    const state = randomBytes(24).toString("base64url");
    const data = Buffer.from(JSON.stringify({state, slug:project.slug, id, vid, expires:Date.now()+600000})).toString("base64url");
    const mac = createHmac("sha256",serverSecret("drive-import")).update(data).digest("base64url");
    (await cookies()).set("baton_drive_import",data + "." + mac,{httpOnly:true,sameSite:"lax",secure:process.env.NEXT_PUBLIC_APP_URL.startsWith("https:"),path:"/api/connectors/drive/callback",maxAge:600});
    consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    consent.search = new URLSearchParams({client_id:client,redirect_uri:new URL("/api/connectors/drive/callback",process.env.NEXT_PUBLIC_APP_URL).href,response_type:"code",scope:"https://www.googleapis.com/auth/drive.readonly",state}).toString();
  } catch (e) { return {message:errorResult(e).message}; }
  redirect(consent.href);
}

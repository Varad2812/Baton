import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getVisitorId, serverSecret } from "@/lib/visitor";
import { importGoogleDoc } from "@/lib/connectors/drive";
import { actionContext } from "@/lib/server/action-context";
import { errorResult } from "@/lib/action-result";

export async function GET(req: Request) {
  const jar = await cookies();
  const saved = jar.get("baton_drive_import")?.value ?? "";
  jar.set("baton_drive_import","",{path:"/api/connectors/drive/callback",maxAge:0});
  const [data, sig] = saved.split(".");
  const expected = createHmac("sha256",serverSecret("drive-import")).update(data).digest("base64url");
  if (!sig || sig.length !== expected.length || !/^[\w-]+$/.test(sig) || !timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))
    return new Response("This Google import has expired. Start again from Sources.",{status:400});
  const session = JSON.parse(Buffer.from(data,"base64url").toString()) as {state:string;vid:string;slug:string;id:string;expires:number};
  const params = new URL(req.url).searchParams;
  if (params.get("state") !== session.state || await getVisitorId() !== session.vid || session.expires < Date.now())
    return new Response("This Google import belongs to another session or has expired.",{status:400});
  const back = new URL("/p/" + encodeURIComponent(session.slug) + "/sources/add?method=drive",req.url);
  let message = "Google authorization was cancelled.";
  try {
    const code = params.get("code");
    if (code) {
      const {project,actor} = await actionContext(session.slug,"connect_sources");
      const redirectUri = new URL("/api/connectors/drive/callback",process.env.NEXT_PUBLIC_APP_URL).href;
      const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),body:new URLSearchParams({
        client_id:process.env.GOOGLE_DRIVE_CLIENT_ID!,client_secret:process.env.GOOGLE_DRIVE_CLIENT_SECRET!,grant_type:"authorization_code",code,redirect_uri:redirectUri
      })});
      const token = response.ok && (await response.json()).access_token;
      if (typeof token !== "string") message = "Google sign-in expired. Start again.";
      else message = await importGoogleDoc(actor,project.id,"https://docs.google.com/document/d/" + session.id + "/edit",token);
    }
  } catch (e) { message = errorResult(e).message; }
  back.searchParams.set("notice",message);
  return NextResponse.redirect(back,303);
}

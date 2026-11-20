import { createHash } from "node:crypto";
import { assertCan, writeAudit, type Actor } from "@/lib/authz";
import { BadRequestError } from "@/lib/http";
import { prisma } from "@/lib/db";
import { markdownSource } from "@/lib/pipeline/adapters";
import { randomId } from "@/lib/pipeline/ids";
import { MAX_FILE_BYTES } from "@/lib/pipeline/ingest/files";
import { appendRawSources } from "@/lib/pipeline/sources";
import { Redactor } from "@/lib/pipeline/normalise";

export function googleDocId(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new BadRequestError("Paste a Google Docs document link."); }
  const path = url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([\w-]{10,200})(?:\/|$)/);
  if (url.origin !== "https://docs.google.com" || !path || url.username || url.password)
    throw new BadRequestError("Use a docs.google.com/document/d/… link to a Google Doc.");
  return path[1];
}

async function readText(res: Response) {
  if (!res.ok || !res.body || !/^(text\/plain|application\/octet-stream)(?:;|$)/i.test(res.headers.get("content-type") ?? "")) {
    throw new BadRequestError("Google could not export this document. Check your viewing and download permissions.");
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_FILE_BYTES) {
      await reader.cancel();
      throw new BadRequestError("Google document exports must be 5 MB or smaller.");
    }
    chunks.push(value);
  }
  const content = Buffer.concat(chunks).toString("utf8").trim();
  if (!content) throw new BadRequestError("This document contains no text.");
  return content;
}

// Only contact fixed Google export locations. Never follow login pages or send a token across a redirect.
export async function fetchGoogleDoc(input: string, token?: string, request: typeof fetch = fetch) {
  const id = googleDocId(input);
  const uri = "https://docs.google.com/document/d/" + id + "/edit";
  const limit = AbortSignal.timeout(18000);
  if (token) {
    const api = "https://www.googleapis.com/drive/v3/files/" + id;
    const opts: RequestInit = { headers: { Authorization: "Bearer " + token }, cache:"no-store", redirect:"error", signal:limit };
    const info = await request(api + "?fields=name,mimeType,capabilities(canDownload)",opts);
    if (!info.ok) throw new BadRequestError("Your Google account cannot read that document.");
    const meta = await info.json() as {name?:string;mimeType?:string; capabilities?:{canDownload?:boolean}};
    if (meta.mimeType !== "application/vnd.google-apps.document" || !meta.capabilities?.canDownload)
      throw new BadRequestError("Choose a Google Doc that permits downloading.");
    const res = await request(api + "/export?mimeType=text%2Fplain",opts);
    return {id,uri,title:meta.name || "Google Doc",content:await readText(res)};
  }
  let url = new URL("https://docs.google.com/document/d/" + id + "/export?format=txt");
  for (let hop = 0; hop < 4; hop++) {
    const res = await request(url,{cache:"no-store",redirect:"manual",signal:limit});
    if (res.status < 300 || res.status > 399) return {id,uri,title:"Google Doc · " + id.slice(-8),content:await readText(res)};
    const target = res.headers.get("location");
    if (!target) break;
    const next = new URL(target,url);
    if (next.protocol !== "https:" || next.port || next.username || next.password ||
        !(next.hostname === "docs.google.com" || next.hostname.endsWith(".googleusercontent.com"))) break;
    url = next;
  }
  throw new BadRequestError("This document requires Google sign-in. Use private import or upload its exported file.");
}

export async function importGoogleDoc(actor: Actor, projectId: string, input: string, token?: string) {
  assertCan(actor,"connect_sources");
  const doc = await fetchGoogleDoc(input,token);
  const digest = createHash("sha256").update(doc.content).digest("hex");
  const externalId = "drive:" + doc.id + ":" + digest;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    if (await tx.source.findUnique({where:{projectId_externalId:{projectId,externalId}}})) return "This revision is already imported.";
    const title = new Redactor("drive_title_").redact(doc.title,null).text;
    const source = markdownSource({ key: randomId("src"), externalId, title, uri:doc.uri, authoritative:false, access:"RESTRICTED", createdAt:new Date() },doc.content);
    const added = await appendRawSources(tx,projectId,[source]);
    if (!added.newSources.length) throw new BadRequestError("No readable paragraphs were found.");
    await writeAudit(tx,{projectId,actor,action:"drive.import",targetType:"Source",targetId:added.newSources[0]});
    return "Imported a Restricted copy. Run the pipeline to extract facts.";
  },{timeout:30000});
}

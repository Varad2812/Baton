// Uploaded files -> RawSource[]. Supports .md .txt .csv (Trello export or any sheet),
// .json chat exports (Discord: DiscordChatExporter single-channel or multi-channel; Slack:
// message array or {messages}), and .docx (text via mammoth).

import type { Access } from "@/generated/prisma/enums";
import { BadRequestError } from "@/lib/http";
import { chatSources, markdownSource, parseCsv, sheetSource, trelloSource, type ChatExport } from "../adapters";
import type { RawSource } from "../normalise";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 10;
export const ACCEPTED = [".md", ".markdown", ".txt", ".csv", ".json", ".docx", ".pdf", ".zip"] as const;

export type UploadFile = { name: string; bytes: Uint8Array };

export type FileOpts = {
  access: Access;
  authoritative?: boolean;
  author?: string;
  createdAt?: Date;
  /** Source id generator (one call per produced source). */
  key: () => string;
};

const ext = (name: string) => (name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "");
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? name;

type SlackMessage = {
  type?: string;
  subtype?: string;
  user?: string;
  user_name?: string;
  username?: string;
  user_profile?: { real_name?: string; display_name?: string; name?: string };
  text?: string;
  ts?: string;
};

type DiscordMessage = { timestamp: string; content: string; author: { name: string; nickname?: string } };
type DiscordSingle = { guild?: { name: string }; channel: { name: string }; messages: DiscordMessage[] };

export function isSlackMessages(v: unknown): v is SlackMessage[] {
  return Array.isArray(v) && v.length > 0 && v.every((m) => m && typeof m === "object" && "ts" in m && "text" in m);
}

/** Slack export (one channel's messages) -> the Discord-shaped ChatExport our adapter reads. */
export function slackToChatExport(messages: SlackMessage[], channel: string): ChatExport {
  return {
    channels: [
      {
        channel: { name: channel },
        messages: messages
          .filter((m) => (m.type ?? "message") === "message" && !m.subtype && m.text?.trim())
          .sort((a, b) => Number(a.ts) - Number(b.ts))
          .map((m) => {
            const display = m.user_profile?.display_name || m.user_profile?.real_name;
            const handle = m.user_profile?.name || m.user_name || m.username || m.user || "unknown";
            return {
              timestamp: new Date(Number(m.ts) * 1000).toISOString(),
              content: m.text!.trim(),
              author: { name: handle, nickname: display && display !== handle ? display : undefined },
            };
          }),
      },
    ],
  };
}

export function chatExportFromJson(json: unknown, fileName: string): ChatExport | null {
  const channel = baseName(fileName).replace(/\.json$/i, "").replace(/[^\w-]+/g, "-") || "chat";
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.channels)) return json as ChatExport;
    if (o.channel && Array.isArray(o.messages) && (o.messages as unknown[]).every((m) => m && typeof m === "object" && "content" in (m as object))) {
      const d = json as DiscordSingle;
      return { guild: d.guild, channels: [{ channel: d.channel, messages: d.messages }] };
    }
    if (isSlackMessages(o.messages)) return slackToChatExport(o.messages, channel);
  }
  if (isSlackMessages(json)) return slackToChatExport(json, channel);
  return null;
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

export async function fileToRawSources(file: UploadFile, opts: FileOpts): Promise<RawSource[]> {
  const name = baseName(file.name);
  const e = ext(name);
  if (!ACCEPTED.includes(e as (typeof ACCEPTED)[number])) {
    throw new BadRequestError(`${name}: unsupported file type. Use ${ACCEPTED.join(", ")}.`);
  }
  if (file.bytes.byteLength > MAX_FILE_BYTES) throw new BadRequestError(`${name}: larger than 5 MB.`);
  if (file.bytes.byteLength === 0) throw new BadRequestError(`${name}: file is empty.`);

  const createdAt = opts.createdAt ?? new Date();
  const base = {
    title: name,
    uri: `upload:${name}`,
    access: opts.access,
    authoritative: !!opts.authoritative,
    author: opts.author,
    createdAt,
  };

  if (e === ".pdf") return [await pdfSource(file, { ...base, key: opts.key() })];

  if (e === ".zip") {
    // Official Slack export: same importer as the live Slack connector. Visibility maps per channel;
    // choosing Restricted for the whole file makes every channel Restricted.
    const { parseSlackExport } = await import("@/lib/connectors/slack/export");
    const { channelToRaw } = await import("@/lib/connectors/slack/map");
    const ex = parseSlackExport(file.bytes);
    const users = new Map(ex.users.map((u) => [u.id, u]));
    const raws = ex.channels.map((c) => channelToRaw(c, { key: opts.key(), team: { ...ex.team, url: null }, users, access: opts.access === "RESTRICTED" ? "RESTRICTED" : null }));
    if (!raws.some((r) => r.items.length)) throw new BadRequestError(`${name}: the Slack export has no messages.`);
    return raws.filter((r) => r.items.length);
  }

  if (e === ".docx") {
    const text = await docxText(file.bytes);
    if (!text.trim()) throw new BadRequestError(`${name}: no text found in the document.`);
    return [markdownSource({ ...base, key: opts.key() }, text)];
  }

  const text = new TextDecoder("utf-8").decode(file.bytes).replace(/^﻿/, "");

  if (e === ".csv") {
    const header = parseCsv(text)[0] ?? [];
    if (header.length < 2) throw new BadRequestError(`${name}: needs a header row with at least 2 columns.`);
    const isTrello = header.includes("Card Name") && header.includes("List");
    return [isTrello ? trelloSource({ ...base, key: opts.key() }, text) : sheetSource({ ...base, key: opts.key() }, text)];
  }

  if (e === ".json") {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new BadRequestError(`${name}: not valid JSON.`);
    }
    const chat = chatExportFromJson(json, name);
    if (!chat) {
      throw new BadRequestError(`${name}: JSON is not a Discord or Slack export (expected messages with author and text).`);
    }
    return chatSources(chat, () => ({ key: opts.key(), access: opts.access })).filter((s) => s.items.length > 0);
  }

  // .md / .markdown / .txt
  return [markdownSource({ ...base, key: opts.key() }, text)];
}

/** Text PDFs only: one item per paragraph with a page locator ("p.3"). Scanned or locked PDFs get a clear error. */
async function pdfSource(file: UploadFile, base: { key: string; title: string; uri: string; access: Access; authoritative: boolean; author?: string; createdAt: Date }): Promise<RawSource> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
    pages = (await extractText(pdf, { mergePages: false })).text as unknown as string[];
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/password|encrypt/i.test(msg)) throw new BadRequestError(`${base.title}: the PDF is password-protected. Remove the password and upload it again.`);
    throw new BadRequestError(`${base.title}: could not read this PDF. It may be damaged; export it again or upload a .docx.`);
  }
  const chars = pages.join("").replace(/\s/g, "").length;
  if (chars < 20) {
    throw new BadRequestError(`${base.title}: no text found. It looks like a scanned PDF (pages are images). Run OCR on it first, or upload the original document.`);
  }
  const items: RawSource["items"] = [];
  pages.forEach((page, i) => {
    for (const para of page.split(/\n\s*\n|(?<=[.!?])\s{2,}/).map((p) => p.replace(/[ \t]+/g, " ").trim()).filter((p) => p.length > 1)) {
      items.push({ text: para, locator: `p.${i + 1}`, pos: { label: "p.", from: String(i + 1), to: String(i + 1) } });
    }
  });
  return { ...base, kind: "DOC", mergeItems: true, items };
}

// Ask Baton: chat answers and field drafts. Order of every request:
//   persona (getActor) -> permission check -> persona-filtered context -> engine chain
//   (Groq, Gemini, offline) -> leak scan (canaries + hidden quotes) -> redaction pass -> reply.
import { z } from "zod";
import { assertCan, projectPersonas, writeAudit, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { scanForLeaks } from "@/lib/handover/compile";
import { approvalBlockers } from "@/lib/handover/gates";
import { Redactor } from "@/lib/pipeline/normalise";
import { citationLabel } from "@/lib/views/format";
import { claimInclude } from "@/lib/views/claims";
import { allowedAccess } from "@/lib/authz";
import { ACTION_IDS, isActionId, PAGES, type AssistantActionId, type PageKey, type PeopleNames } from "./actions";
import type { AssistantContext, CitableFact } from "./context";
import { isVisible } from "./context";
import { defaultEngines, runChain, type ChatEngine, type EngineName } from "./engines";
import { DRAFT_FIELDS, FIELD_SPEC, isTestimonyField, notesAreEmpty, TESTIMONY_REFUSAL } from "./fields";
import { knowledgeFor, loadKnowledge } from "./knowledge";
import { scoreFaq } from "./match";
import { loadAssistantContext } from "./load";
import { inventedTerms, offlineAnswer, offlineDraft, redirectAnswer, tidyNotes, type DraftSubject, type RawAnswer } from "./offline";

/* ------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* ------------------------------------------------------------------------- */

export const ChatInput = z.object({
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/).nullable().optional(),
  page: z.enum(PAGES),
  message: z.string().trim().min(1, "Type a question").max(600),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2500) }))
    .max(12)
    .default([]),
});
export type ChatInputT = z.infer<typeof ChatInput>;

export const DraftInput = z.object({
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/).nullable().optional(),
  field: z.enum(DRAFT_FIELDS),
  notes: z.string().max(2000).default(""),
  current: z.string().max(4000).default(""),
  target: z
    .object({
      claimId: z.string().max(80).optional(),
      conflictId: z.string().max(80).optional(),
      questionId: z.string().max(80).optional(),
      followUpId: z.string().max(80).optional(),
      section: z.string().max(80).optional(),
      projectName: z.string().max(120).optional(),
    })
    .default({}),
});
export type DraftInputT = z.infer<typeof DraftInput>;

/* ------------------------------------------------------------------------- */
/* Outputs                                                                    */
/* ------------------------------------------------------------------------- */

export type Citation = CitableFact;
export type AssistantReply = {
  text: string;
  citations: Citation[];
  actions: AssistantActionId[];
  engine: EngineName;
  model: string | null;
  refused?: "leak" | "off_topic";
};

export type DraftReply = { text: string | null; refusal?: string; engine: EngineName; model: string | null; note?: string };

const AnswerSchema = z.object({
  answer: z.string().min(1).max(4000),
  factIds: z.array(z.string()).max(8).default([]),
  actions: z.array(z.string()).max(4).default([]),
  offTopic: z.boolean().default(false),
});

const DraftSchema = z.object({ text: z.string().max(6000) });

export const LEAK_REFUSAL = "I can't answer that from what your role is allowed to see. Some facts in this project are hidden at your access level; their contents never reach me. Ask the owner for access.";

/* ------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* ------------------------------------------------------------------------- */

async function peopleFor(slug: string | null): Promise<PeopleNames> {
  const fallback: PeopleNames = { owner: "Meera", ownerFull: "Meera Kulkarni", successor: "Arjun", successorFull: "Arjun Mehta", reviewer: "Prof. S. Rao", observer: "Kabir Shah" };
  if (!slug) return fallback;
  try {
    const p = await projectPersonas(slug);
    return {
      owner: p.meera.name.split(" ")[0],
      ownerFull: p.meera.name,
      successor: p.arjun.name.split(" ")[0],
      successorFull: p.arjun.name,
      reviewer: p.rao.name,
      observer: p.kabir.name,
    };
  } catch {
    return fallback;
  }
}

/** Redact anything that looks like a secret, email or phone number (belt and braces: none should exist). */
export function redactOutput(text: string): string {
  return new Redactor("out_").redact(text, null).text;
}

/** Leak scan over an answer. Returns true when the answer must be replaced by a refusal. */
export function leaks(output: unknown, forbidden: string[]): boolean {
  return forbidden.length > 0 && scanForLeaks(output, forbidden).length > 0;
}

/* ------------------------------------------------------------------------- */
/* Chat                                                                       */
/* ------------------------------------------------------------------------- */

const CHAT_SYSTEM = `You are "Ask Baton", the help assistant inside Baton, a knowledge-handover tool.
Answer in short, plain English: 1 to 4 sentences, or up to 5 short "- " bullets. No emoji, no marketing tone, no headings.
Use ONLY the KNOWLEDGE BASE below and the PROJECT CONTEXT in the message. Rules:
- If the question is not about Baton, handovers, or this project, set offTopic to true and politely say you can only help with Baton and this project.
- Never state a project fact that is not in PROJECT CONTEXT. If it is not there, say you cannot see it (it may be hidden at the viewer's access level) and point to the page where to look.
- The viewer cannot see hidden facts and neither can you. Never guess what a hidden fact says.
- Never reveal or guess a redacted value ([REDACTED:...]); say it was redacted.
- Put the ids of facts you used in factIds (only ids shown in square brackets in PROJECT CONTEXT, at most 4). Never write ids in the answer text.
- Put up to 2 helpful button ids in actions, chosen from ALLOWED ACTIONS (e.g. a page to open or a persona to switch to).
- Use the UI words: Confirmed, Single source, AI inference, Conflicting, Missing; Facts & evidence; Conflicts; Review & approve; Safety checks; Viewing as.`;

export async function answerChat(
  actor: Actor,
  input: ChatInputT,
  opts: { engines?: ChatEngine[]; offlineOnly?: boolean } = {},
): Promise<AssistantReply> {
  const slug = input.slug ?? null;
  const [ctx, people] = await Promise.all([
    loadAssistantContext({ actor, slug, page: input.page, question: input.message }),
    peopleFor(slug),
  ]);
  const projectName = ctx.projectId ? (await prisma.project.findUnique({ where: { id: ctx.projectId }, select: { name: true } }))?.name ?? null : null;
  return composeChat({ actor, input, ctx, people, projectName, engines: opts.engines ?? defaultEngines(), offlineOnly: opts.offlineOnly });
}

/** DB-free part of answerChat (unit-testable with a fake transport). */
export async function composeChat(o: {
  actor: Pick<Actor, "name" | "role">;
  input: ChatInputT;
  ctx: AssistantContext;
  people: PeopleNames;
  projectName: string | null;
  engines: ChatEngine[];
  offlineOnly?: boolean;
}): Promise<AssistantReply> {
  const { ctx, input } = o;
  const kb = loadKnowledge();
  // History from the browser is user-supplied: drop any turn that carries text this viewer may not see
  // (e.g. an answer given before a persona switch).
  const history = input.history.filter((h) => !leaks(h.text, ctx.forbidden)).slice(-6);
  const prompt = [
    `ALLOWED ACTIONS: ${ACTION_IDS.join(", ")}`,
    "",
    "PROJECT CONTEXT:",
    ctx.text,
    "",
    history.length ? `CONVERSATION SO FAR:\n${history.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text.slice(0, 600)}`).join("\n")}\n` : "",
    `QUESTION: ${input.message}`,
  ].join("\n");

  const offlineOpts = { role: o.actor.role, page: input.page, people: o.people, projectName: o.projectName };
  const r = await runChain<RawAnswer>({
    engines: o.engines,
    system: `${CHAT_SYSTEM}\n\nKNOWLEDGE BASE (excerpt):\n${knowledgeFor(input.message, input.page, scoreFaq)}`,
    prompt,
    schema: AnswerSchema as z.ZodType<RawAnswer>,
    offline: () => offlineAnswer(input.message, ctx, kb.faq, offlineOpts),
    offlineOnly: o.offlineOnly,
  });

  let raw = r.value;
  if (raw.offTopic && r.engine !== "offline") raw = { ...redirectAnswer(offlineOpts), answer: raw.answer || redirectAnswer(offlineOpts).answer };
  const citable = new Map(ctx.facts.map((f) => [f.id, f]));
  // The offline engine may cite any relevant visible fact; models only what they were shown.
  for (const c of ctx.relevant) if (!citable.has(c.id)) citable.set(c.id, { id: c.id, title: c.title, grade: c.grade });
  for (const c of ctx.summary.openConflicts) for (const x of [c.a, c.b]) if (!citable.has(x.id)) citable.set(x.id, { id: x.id, title: x.title, grade: x.grade });

  const reply: AssistantReply = {
    text: redactOutput(raw.answer.trim()),
    citations: [...new Set(raw.factIds)].map((id) => citable.get(id)).filter((x): x is Citation => !!x).slice(0, 4),
    actions: [...new Set(raw.actions)].filter(isActionId).slice(0, 3),
    engine: r.engine,
    model: r.model,
    refused: raw.offTopic ? "off_topic" : undefined,
  };
  if (!o.projectName) reply.actions = reply.actions.filter((a) => a === "nav:new" || a === "nav:dashboard");
  if (leaks(reply, ctx.forbidden)) {
    return { text: LEAK_REFUSAL, citations: [], actions: [], engine: r.engine, model: r.model, refused: "leak" };
  }
  return reply;
}

/* ------------------------------------------------------------------------- */
/* Drafts                                                                     */
/* ------------------------------------------------------------------------- */

const DRAFT_SYSTEM = `You write the text for ONE form field in Baton, a knowledge-handover tool.
Write plain, specific, professional English. No emoji, no greeting, no sign-off, no surrounding quotes, no markdown.
Use only the CONTEXT and the NOTES you are given. Never invent names, numbers, dates, tools or decisions.
Return JSON {"text": "..."} with the field text only.`;

const TESTIMONY_RULES = `This field is TESTIMONY: the departing owner's own answer, cited as a source.
Rephrase ONLY the NOTES into clear first-person sentences. Keep every fact in the notes and add none:
no name, number, date, tool, place, account or reason that is not in the NOTES, even if it appears in the question.
If the notes are short, the answer is short.`;

type DraftCtx = { subject: DraftSubject; lines: string[]; forbidden: string[]; projectId: string | null };

async function loadDraftContext(actor: Actor, input: DraftInputT): Promise<DraftCtx> {
  const slug = input.slug ?? null;
  const t = input.target;
  const people = await peopleFor(slug);
  const subject: DraftSubject = { owner: people.owner, successor: people.successor, role: actor.role, section: t.section ?? null, projectName: t.projectName ?? null };
  const lines: string[] = [];
  if (!slug) {
    if (t.projectName) lines.push(`Project name: ${t.projectName}`);
    return { subject, lines, forbidden: [], projectId: null };
  }
  const base = await loadAssistantContext({ actor, slug, page: "dashboard", question: "" });
  const projectId = base.projectId;
  if (!projectId) return { subject, lines, forbidden: [], projectId: null };
  const allowed = await allowedAccess(actor.role, projectId);
  subject.projectName = (await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }))?.name ?? null;
  lines.push(`Project: ${subject.projectName}. Viewer: ${actor.name} (${actor.role.toLowerCase()}).`);

  const visibleClaim = async (id: string | undefined) => {
    if (!id) return null;
    const c = await prisma.claim.findFirst({ where: { id, projectId }, include: claimInclude });
    if (!c) return null;
    const ok = isVisible(allowed, {
      ...c,
      date: null,
      owner: null,
      evidence: c.evidence.map((e) => ({ quote: e.quote, relation: e.relation, cite: "", chunk: { access: e.chunk.access, sourceId: e.chunk.sourceId } })),
    });
    return ok ? c : null;
  };
  const describe = (c: NonNullable<Awaited<ReturnType<typeof visibleClaim>>>) => {
    const ev = c.evidence.find((e) => e.quoteValid && e.relation === "SUPPORTS");
    const cite = ev ? citationLabel(ev.chunk.source, ev.chunk, ev.matchStart) : null;
    return { title: c.title, statement: c.statement, grade: c.grade, gradeReason: c.gradeReason, cite, quote: ev?.quote ?? "" };
  };

  if (t.claimId) {
    const c = await visibleClaim(t.claimId);
    if (c) {
      const d = describe(c);
      subject.claim = d;
      lines.push(`Fact: ${d.title}. ${d.statement}`, `Grade: ${d.grade} (${d.gradeReason})`, d.quote ? `Quote: "${d.quote}" (${d.cite})` : "");
    }
  }
  if (t.conflictId) {
    const cf = await prisma.conflict.findFirst({ where: { id: t.conflictId, projectId } });
    const [a, b] = cf ? await Promise.all([visibleClaim(cf.claimAId), visibleClaim(cf.claimBId)]) : [null, null];
    if (a && b) {
      const da = describe(a);
      const db = describe(b);
      subject.conflict = { a: { title: da.title, quote: da.quote, cite: da.cite ?? "source A" }, b: { title: db.title, quote: db.quote, cite: db.cite ?? "source B" } };
      lines.push(`Conflict A: ${da.title}: "${da.quote}" (${da.cite})`, `Conflict B: ${db.title}: "${db.quote}" (${db.cite})`);
    }
  }
  if (t.questionId) {
    const q = await prisma.gapQuestion.findFirst({ where: { id: t.questionId, projectId } });
    if (q && (!q.relatedClaimId || (await visibleClaim(q.relatedClaimId)))) {
      subject.question = { question: q.question, rationale: q.rationale };
      lines.push(`Interview question: ${q.question}`, `Why it is asked: ${q.rationale}`);
    }
  }
  if (t.followUpId) {
    const f = await prisma.followUp.findFirst({ where: { id: t.followUpId, handover: { projectId } } });
    if (f && (!f.claimId || (await visibleClaim(f.claimId)))) {
      subject.question = { question: f.question, rationale: f.section ? `About the "${f.section}" section` : "" };
      lines.push(`Follow-up question from the successor: ${f.question}`);
    }
  }
  if (input.field === "override_note" || input.field === "approval_note") {
    const [conflicts, questions] = await Promise.all([prisma.conflict.findMany({ where: { projectId } }), prisma.gapQuestion.findMany({ where: { projectId } })]);
    subject.blockers = approvalBlockers({ conflicts, questions }).map((b) => b.label);
    if (subject.blockers.length) lines.push(`Open blockers: ${subject.blockers.join("; ")}`);
    lines.push(`Successor: ${people.successorFull}. Owner: ${people.ownerFull}.`);
  }
  if (t.section) lines.push(`Section: ${t.section}`);
  return { subject, lines: lines.filter(Boolean), forbidden: base.forbidden, projectId };
}

export async function draftField(actor: Actor, input: DraftInputT, opts: { engines?: ChatEngine[]; offlineOnly?: boolean } = {}): Promise<DraftReply> {
  const spec = FIELD_SPEC[input.field];
  if (spec.permission) assertCan(actor, spec.permission);
  if (input.slug && !(await prisma.project.findUnique({ where: { slug: input.slug }, select: { id: true } }))) {
    return { text: null, refusal: "Project not found.", engine: "offline", model: null };
  }
  const ctx = await loadDraftContext(actor, input);
  return composeDraft({ actor, input, ctx, engines: opts.engines ?? defaultEngines(), offlineOnly: opts.offlineOnly });
}

/** DB-free part of draftField. Enforces the testimony rule before and after any model call. */
export async function composeDraft(o: {
  actor: Pick<Actor, "name" | "role">;
  input: DraftInputT;
  ctx: DraftCtx;
  engines: ChatEngine[];
  offlineOnly?: boolean;
}): Promise<DraftReply> {
  const { input, ctx } = o;
  const spec = FIELD_SPEC[input.field];
  const testimony = isTestimonyField(input.field);
  // Notes typed in the popover win; otherwise the field's own text is what the user knows.
  const notes = notesAreEmpty(input.notes) ? input.current : input.notes;
  if (testimony && notesAreEmpty(notes)) {
    return { text: null, refusal: TESTIMONY_REFUSAL, engine: "offline", model: null };
  }
  const prompt = [
    `FIELD: ${spec.label}`,
    `GOAL: ${spec.goal} At most ${spec.max} characters.`,
    testimony ? TESTIMONY_RULES : "",
    "",
    "CONTEXT:",
    ctx.lines.join("\n") || "(none)",
    "",
    `NOTES from ${o.actor.name}:`,
    notesAreEmpty(notes) ? "(none: write a sensible default from the context)" : notes,
  ].join("\n");

  const offline = () => {
    const d = offlineDraft(input.field, notes, ctx.subject);
    return { text: d.text ?? "" };
  };
  const r = await runChain({ engines: o.engines, system: DRAFT_SYSTEM, prompt, schema: DraftSchema, offline, offlineOnly: o.offlineOnly, temperature: 0.3 });
  let text = r.value.text.trim().replace(/^["“]|["”]$/g, "");
  let engine = r.engine;
  let model = r.model;
  let note: string | undefined;

  if (testimony && engine !== "offline") {
    const allowedText = `${notes}\n${ctx.subject.question?.question ?? ""}\n${o.actor.name}`;
    const added = inventedTerms(text, allowedText);
    if (added.length) {
      text = tidyNotes(notes);
      engine = "offline";
      model = null;
      note = "Kept to your own words: the suggestion added details you did not write.";
    }
  }
  text = redactOutput(text).slice(0, spec.max);
  if (!text) return { text: null, refusal: testimony ? TESTIMONY_REFUSAL : "Nothing to draft yet. Add a few words of notes.", engine, model };
  if (leaks(text, ctx.forbidden)) return { text: null, refusal: LEAK_REFUSAL, engine, model };
  return { text, engine, model, note };
}

/* ------------------------------------------------------------------------- */
/* Audit: a draft that was inserted into a field                              */
/* ------------------------------------------------------------------------- */

export const DraftUsedInput = z.object({
  slug: z.string().trim().min(1).max(80),
  field: z.enum(DRAFT_FIELDS),
  mode: z.enum(["insert", "replace"]),
  engine: z.enum(["groq", "gemini", "offline"]),
  targetId: z.string().max(80).optional(),
});

export async function recordDraftUsed(actor: Actor, raw: z.input<typeof DraftUsedInput>) {
  const v = DraftUsedInput.parse(raw);
  const project = await prisma.project.findUnique({ where: { slug: v.slug }, select: { id: true } });
  if (!project) return { logged: false };
  await writeAudit(prisma, {
    projectId: project.id,
    actor,
    action: "assistant.draft.used",
    targetType: "Field",
    targetId: v.targetId ?? v.field,
    meta: { field: v.field, mode: v.mode, engine: v.engine },
  });
  return { logged: true };
}

export type { PageKey };

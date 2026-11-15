// Offline engine: answers without any model. FAQ keyword/fuzzy match over the knowledge base,
// templated answers from the project's (persona-filtered) counts, and template drafts. Pure.
import type { Role } from "@/generated/prisma/enums";
import { GRADE_SHORT } from "@/lib/views/format";
import type { AssistantActionId, PageKey, PeopleNames } from "./actions";
import type { AssistantContext, CtxClaim } from "./context";
import { FIELD_SPEC, notesAreEmpty, TESTIMONY_REFUSAL, isTestimonyField, type DraftField } from "./fields";
import type { FaqEntry } from "./knowledge";
import { matchFaq, overlapScore, scoreFaq } from "./match";

export type RawAnswer = { answer: string; factIds: string[]; actions: AssistantActionId[]; offTopic: boolean };

type OfflineOpts = { role: Role; page: PageKey; people: PeopleNames; projectName: string | null };

const DEFINE_RE = /\b(what (does|do|is|are)\b.*\b(mean|meaning)|meaning of|define|definition|stand for)\b/i;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function conflictsAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer {
  const cs = ctx.summary.openConflicts;
  const can = o.role === "OWNER" || o.role === "REVIEWER";
  if (!cs.length) {
    return {
      answer: `${o.projectName ?? "This project"} has no open conflicts you can see. Superseded decisions (for example an earlier tool that was replaced) are shown on the decision timeline, not as conflicts.`,
      factIds: [],
      actions: ["nav:conflicts"],
      offTopic: false,
    };
  }
  const lines = cs.slice(0, 4).map((c) => `- ${c.a.title} vs ${c.b.title}`);
  return {
    answer: `${o.projectName ?? "This project"} has ${plural(cs.length, "open conflict")}:\n${lines.join("\n")}\n${can ? "Open Conflicts to pick A, pick B, mark both valid, or ask the owner." : `Only the owner or the reviewer can resolve them; switch to ${o.people.reviewer} to try it.`}`,
    factIds: cs.slice(0, 2).flatMap((c) => [c.a.id, c.b.id]),
    actions: can ? ["nav:conflicts"] : ["nav:conflicts", "persona:rao"],
    offTopic: false,
  };
}

function missingAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer {
  const qs = ctx.summary.openQuestions;
  const missing = ctx.summary.byGrade.MISSING;
  if (o.role === "OBSERVER") {
    return {
      answer: `You can see ${plural(missing, "Missing fact")}. The questions for ${o.people.owner} are Team data, so they are not visible to an observer. Switch to ${o.people.ownerFull} to see and answer them.`,
      factIds: [],
      actions: ["persona:meera"],
      offTopic: false,
    };
  }
  if (!qs.length) {
    return { answer: `Every question for ${o.people.owner} has been answered (${ctx.summary.answeredQuestions} answered). Answers are saved as testimony.`, factIds: [], actions: ["nav:interview"], offTopic: false };
  }
  const top = qs.slice(0, 3).map((q) => `- ${q.question}`);
  return {
    answer: `${plural(qs.length, "question")} for ${o.people.owner} ${qs.length === 1 ? "is" : "are"} still open (${missing} facts are Missing). Highest priority:\n${top.join("\n")}\n${o.role === "OWNER" ? "Answer them on Questions for you; each answer becomes testimony." : `Only ${o.people.owner} can answer them.`}`,
    factIds: qs.slice(0, 3).map((q) => q.relatedClaimId).filter((x): x is string => !!x && ctx.facts.some((f) => f.id === x)),
    actions: o.role === "OWNER" ? ["nav:interview"] : ["nav:interview", "persona:meera"],
    offTopic: false,
  };
}

function statusAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer {
  const s = ctx.summary;
  const h = s.handover;
  const status = h ? (h.versions ? `approved (v${h.versions})` : h.status === "IN_REVIEW" ? "in review, not yet approved" : "a draft") : "not started";
  return {
    answer: `${o.projectName ?? "This project"}: you can see ${plural(s.visible, "fact")} (${s.byGrade.VERIFIED} Confirmed, ${s.byGrade.SINGLE_SOURCE} Single source, ${s.byGrade.INFERRED} AI inference, ${s.byGrade.CONFLICTING} Conflicting, ${s.byGrade.MISSING} Missing) from ${plural(s.sources, "source")}.${s.hidden ? ` ${plural(s.hidden, "fact")} ${s.hidden === 1 ? "is" : "are"} hidden at your access level.` : ""} ${plural(s.openConflicts.length, "conflict")} open${o.role === "OBSERVER" ? "" : `, ${plural(s.openQuestions.length, "question")} for ${o.people.owner} open`}. The handover is ${status}.`,
    factIds: [],
    actions: ["nav:dashboard"],
    offTopic: false,
  };
}

function hiddenAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer {
  const n = ctx.summary.hidden;
  return {
    answer: n
      ? `${plural(n, "fact")} ${n === 1 ? "is" : "are"} hidden at your access level. Their contents are never sent to your browser or to me, only the count. ${o.role === "INCOMING" ? "Use Request access on the handover and the owner can grant the source." : `Switch to ${o.people.reviewer} to see everything.`}`
      : "Nothing is hidden from you: your role sees every fact in this project.",
    factIds: [],
    actions: o.role === "INCOMING" ? ["nav:handover"] : o.role === "OBSERVER" ? ["persona:rao"] : [],
    offTopic: false,
  };
}

function blockersAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer {
  const c = ctx.summary.openConflicts.length;
  const p1 = ctx.summary.openQuestions.filter((q) => q.priority >= 40).length;
  const parts = [c ? plural(c, "open conflict") : "", p1 ? plural(p1, "unanswered top-priority question") : ""].filter(Boolean);
  return {
    answer: parts.length
      ? `Approval is blocked by ${list(parts)}. Resolve them first, or as ${o.people.reviewer} tick Override and write a note of at least 10 characters; the open items are listed on the receipt.`
      : `Nothing blocks approval${o.role === "OBSERVER" ? " that you can see" : ""}. ${o.people.reviewer} can approve from Review & approve.`,
    factIds: [],
    actions: o.role === "REVIEWER" ? ["nav:review"] : ["nav:review", "persona:rao"],
    offTopic: false,
  };
}

function planAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer | null {
  const p = ctx.summary.plan;
  if (!p || !p.plan7.length) return null;
  return {
    answer: `${o.people.successor}'s 7-day plan${p.approved ? "" : " (draft preview, not yet approved)"}:\n${p.plan7.slice(0, 5).map((t) => `- ${t}`).join("\n")}`,
    factIds: [],
    actions: ["nav:handover"],
    offTopic: false,
  };
}

function nextAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer {
  if (o.page === "landing")
    return { answer: "Open the live demo and follow the Start here panel on the right: five Do it buttons that switch persona and open the right page for you.", factIds: [], actions: ["nav:dashboard"], offTopic: false };
  switch (o.role) {
    case "OWNER":
      return ctx.summary.openQuestions.length
        ? { answer: `As ${o.people.owner}, answer the questions only you can answer: ${plural(ctx.summary.openQuestions.length, "question")} open. Then follow Start here, step 3, to resolve a conflict as the reviewer.`, factIds: [], actions: ["nav:interview", "persona:rao"], offTopic: false }
        : { answer: "Your questions are answered. Next, switch to the reviewer to resolve conflicts and approve.", factIds: [], actions: ["persona:rao"], offTopic: false };
    case "REVIEWER":
      return ctx.summary.openConflicts.length
        ? { answer: `Resolve the ${plural(ctx.summary.openConflicts.length, "open conflict")} first, then approve on Review & approve.`, factIds: [], actions: ["nav:conflicts", "nav:review"], offTopic: false }
        : { answer: "No conflicts are open. Approve the handover on Review & approve.", factIds: [], actions: ["nav:review"], offTopic: false };
    case "INCOMING":
      return { answer: `Read your handover, acknowledge each section and ask ${o.people.owner} follow-ups where something is unclear.`, factIds: [], actions: ["nav:handover"], offTopic: false };
    default:
      return { answer: `You are viewing as an observer (read-only, Public facts only). Browse Facts & evidence, or switch to ${o.people.reviewer} to resolve conflicts and approve.`, factIds: [], actions: ["nav:ledger", "persona:rao"], offTopic: false };
  }
}

function factsAnswer(facts: CtxClaim[]): RawAnswer {
  const top = facts.slice(0, 3);
  const lines = top.map((c) => {
    const q = c.evidence.find((e) => e.quote && e.relation === "SUPPORTS");
    return `- ${c.title} (${GRADE_SHORT[c.grade]}${q ? `, ${q.cite}` : ""})`;
  });
  return { answer: `Here is what the records you can see say:\n${lines.join("\n")}\nClick a fact to see its quotes.`, factIds: top.map((c) => c.id), actions: [], offTopic: false };
}

export function redirectAnswer(o: Pick<OfflineOpts, "projectName">): RawAnswer {
  return {
    answer: `I can only help with Baton and ${o.projectName ? `the ${o.projectName} handover` : "the demo handover"}: what a page is for, what a grade means, what is open, or who can do what. Try one of the suggested questions.`,
    factIds: [],
    actions: [],
    offTopic: true,
  };
}

/** The offline engine's answer to one question. */
export function offlineAnswer(question: string, ctx: AssistantContext, faq: FaqEntry[], o: OfflineOpts): RawAnswer {
  const q = question.trim();
  const hasProject = !!o.projectName;
  if (/^(hi|hello|hey|thanks|thank you)\b/i.test(q))
    return { answer: "Hi. Ask me what a page is for, what a grade means, or what is still open in this project.", factIds: [], actions: [], offTopic: false };

  const define = DEFINE_RE.test(q);
  if (!define && hasProject) {
    if (/\b(conflicts?|disagree\w*|contradict\w*)\b/i.test(q) && /\b(how many|which|what are|list|open|any|show|remaining|left|still)\b/i.test(q) && !/\bhow (do|can|to|should)\b/i.test(q))
      return conflictsAnswer(ctx, o);
    if (/\b(block\w*|stop\w*|prevent\w*)\b.*\bapprov\w*|\bwhy can'?t (i|we) approve/i.test(q)) return blockersAnswer(ctx, o);
    if (/\bhow many\b.*\bhidden\b|\bhidden\b.*\bhow many\b/i.test(q)) return hiddenAnswer(ctx, o);
    if (/\b(still missing|what('?s| is) missing|missing\b.*\?|gaps?|unanswered|open questions?|left to answer)\b/i.test(q) && !/\bwhat does\b/i.test(q))
      return missingAnswer(ctx, o);
    if (/\bplan\b/i.test(q)) {
      const p = planAnswer(ctx, o);
      if (p) return p;
    }
    if (/\b(status|summary|summari[sz]e|overview|progress|how (is|ready)|ready)\b/i.test(q) && !/\bpipeline\b/i.test(q)) return statusAnswer(ctx, o);
  }
  if (/\b(what should i|where (do|should) i (start|begin)|what next|next step|look at first|start with|get started)\b/i.test(q)) return nextAnswer(ctx, o);

  const faqHit = matchFaq(q, faq);
  const facts = ctx.relevant;
  const factScore = facts.length ? overlapScore(q, `${facts[0].title} ${facts[0].statement}`) : 0;
  if (faqHit && (define || faqHit.score >= 3.5 || factScore < 0.5)) {
    return { answer: faqHit.entry.answer, factIds: [], actions: faqActions(faqHit.entry, o), offTopic: false };
  }
  if (facts.length && factScore >= 0.34) return factsAnswer(facts);
  if (faqHit) return { answer: faqHit.entry.answer, factIds: [], actions: faqActions(faqHit.entry, o), offTopic: false };
  if (hasProject && PROJECT_WORDS.test(q)) return notVisibleAnswer(ctx, o);
  return redirectAnswer(o);
}

/**
 * Generic project vocabulary (never the hidden facts' own words, which would reveal whether a hidden
 * fact mentions something): a question like this is about the project, not off-topic.
 */
const PROJECT_WORDS =
  /\b(auth\w*|login|deploy\w*|database|db|password|credential\w*|secret|key|payment\w*|gateway|refund\w*|sponsor\w*|budget|vendor\w*|contact\w*|owner\w*|decid\w*|decision\w*|deadline\w*|release|repo\w*|code|server|api|bug\w*|build\w*|issue\w*|pr|commit\w*|task\w*|risk\w*|email\w*|account\w*|hosting|domain|migrat\w*|registration\w*|ticket\w*|fest\w*)\b/i;

function notVisibleAnswer(ctx: AssistantContext, o: OfflineOpts): RawAnswer {
  const n = ctx.summary.hidden;
  return {
    answer: `I can't find that in the facts you can see.${n ? ` ${plural(n, "fact")} ${n === 1 ? "is" : "are"} hidden at your access level, and their contents never reach me.` : ""} Search Facts & evidence, or ${o.role === "OWNER" || o.role === "REVIEWER" ? `ask ${o.people.owner} a question in the interview.` : `switch to ${o.people.reviewer}, who sees everything.`}`,
    factIds: [],
    actions: o.role === "OWNER" || o.role === "REVIEWER" ? ["nav:ledger"] : ["nav:ledger", "persona:rao"],
    offTopic: false,
  };
}

function faqActions(e: FaqEntry, o: OfflineOpts): AssistantActionId[] {
  const t = e.question.toLowerCase();
  if (/resolve a conflict|conflicting/.test(t)) return o.role === "OWNER" || o.role === "REVIEWER" ? ["nav:conflicts"] : ["nav:conflicts", "persona:rao"];
  if (/approve/.test(t)) return o.role === "REVIEWER" ? ["nav:review"] : ["nav:review", "persona:rao"];
  if (/interview|missing|testimony/.test(t)) return ["nav:interview"];
  if (/leak|redact|stop the ai/.test(t)) return ["nav:trust"];
  if (/hidden/.test(t)) return o.role === "INCOMING" ? ["nav:handover"] : [];
  if (/own project/.test(t)) return ["nav:new"];
  if (/evidence drawer|confirmed|single source|inference/.test(t)) return ["nav:ledger"];
  if (/successor's handover|follow-up/.test(t)) return ["nav:handover"];
  return [];
}

export { scoreFaq };

/* ------------------------------------------------------------------------- */
/* Drafts                                                                     */
/* ------------------------------------------------------------------------- */

export type DraftSubject = {
  projectName?: string | null;
  claim?: { title: string; statement: string; grade: string; gradeReason: string; cite: string | null } | null;
  conflict?: { a: { title: string; quote: string; cite: string }; b: { title: string; quote: string; cite: string } } | null;
  question?: { question: string; rationale: string } | null;
  blockers?: string[];
  section?: string | null;
  successor?: string;
  owner?: string;
  role?: Role;
};

/** Clean up rough notes without adding anything: whitespace, capitals, "i" -> "I", final full stop. */
export function tidyNotes(notes: string): string {
  let s = notes.replace(/\s+/g, " ").trim();
  if (!s) return s;
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
  s = s.replace(/\bi\b/g, "I").replace(/\bi'(m|ve|ll|d)\b/gi, (_, x: string) => `I'${x.toLowerCase()}`);
  s = s.replace(/\bdont\b/gi, "don't").replace(/\bcant\b/gi, "can't").replace(/\bwont\b/gi, "won't").replace(/\bdoesnt\b/gi, "doesn't");
  if (!/[.!?]$/.test(s)) s += ".";
  return s;
}

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

/** Template draft (no model). Returns null text + refusal for testimony fields with no notes. */
export function offlineDraft(field: DraftField, notes: string, subj: DraftSubject): { text: string | null; refusal?: string } {
  const max = FIELD_SPEC[field].max;
  const n = notesAreEmpty(notes) ? "" : tidyNotes(notes);
  if (isTestimonyField(field)) return n ? { text: cap(n, max) } : { text: null, refusal: TESTIMONY_REFUSAL };
  const c = subj.claim;
  let text: string;
  switch (field) {
    case "project_description":
      text = n || `Handover of ${subj.projectName || "the project"}: decisions, open work, risks and contacts for the next lead.`;
      break;
    case "reject_reason":
      text =
        n ||
        (c?.grade === "INFERRED"
          ? "AI inference with no record that states it; rejected until someone confirms it."
          : c?.grade === "CONFLICTING"
            ? "Contradicted by another source; the other side of the conflict is kept."
            : c?.grade === "SINGLE_SOURCE"
              ? `Only one source supports this${c.cite ? ` (${c.cite})` : ""} and it is out of date.`
              : "Not accurate any more; the cited sources describe an earlier state.");
      break;
    case "reviewer_note":
      text = n || (c ? `Checked against ${c.cite ?? "the cited quote"}. ${c.grade === "VERIFIED" ? "Confirmed." : "Needs one more source before relying on it."}` : "Checked against the cited quotes.");
      break;
    case "edit_statement":
      text = n || c?.statement || "";
      break;
    case "override_note": {
      const b = subj.blockers ?? [];
      text = n
        ? n.length >= 10
          ? n
          : `Approved with open items: ${n}`
        : b.length
          ? `Approving with ${b.length} open item${b.length === 1 ? "" : "s"} (${cap(b.join("; "), 220)}). ${subj.successor ?? "The successor"} to confirm with ${subj.owner ?? "the owner"} in week one.`
          : `Approved for ${subj.successor ?? "the successor"}; nothing is open.`;
      break;
    }
    case "approval_note":
      text = n || `Approved for ${subj.successor ?? "the successor"} after section-by-section review.`;
      break;
    case "followup_question":
      text = n ? (n.endsWith("?") ? n : `${n.replace(/[.!]$/, "")}?`) : c ? `What should I know about "${cap(c.title, 90)}" that the records do not say?` : `What is not written down about ${subj.section ?? "this section"} that I need in my first week?`;
      break;
    case "access_reason":
      text = n || `I am taking over as ${subj.role === "INCOMING" ? "the incoming lead" : "lead"} and need the hidden facts in "${subj.section ?? "this section"}" to plan the first 30 days.`;
      break;
    case "conflict_note":
      text = n || (subj.conflict ? `Compared ${subj.conflict.a.cite} ("${cap(subj.conflict.a.quote, 60)}") with ${subj.conflict.b.cite} ("${cap(subj.conflict.b.quote, 60)}").` : "Compared both quotes.");
      break;
    default:
      text = n;
  }
  return { text: cap(text, max) };
}

/* ------------------------------------------------------------------------- */
/* "No invented testimony" guard                                              */
/* ------------------------------------------------------------------------- */

const COMMON_CAPS = new Set(["I", "I'm", "I've", "I'll", "I'd", "OK"]);
/** Ordinary sentence openers; any other capitalised first word not in the notes counts as a new name. */
const STARTERS = new Set(
  "the a an it its it's this that these those there here we he she they you our my his her their i and but so or then also yes no not if when after before because as for in on at to of with by from all both each every some any one only just currently now today right please note nobody someone everyone nothing everything only".split(" "),
);

/**
 * Specific terms in a draft (numbers, capitalised names mid-sentence, acronyms, emails, URLs)
 * that do not appear in `allowed` (the user's notes plus the question). Any hit means the model
 * added a fact, and the draft is replaced by a plain tidy-up of the notes.
 */
export function inventedTerms(draft: string, allowed: string): string[] {
  const hay = allowed.toLowerCase();
  const out = new Set<string>();
  for (const m of draft.match(/[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+/g) ?? []) if (!hay.includes(m.toLowerCase())) out.add(m);
  for (const m of draft.match(/\d[\d,.:/-]*/g) ?? []) {
    const v = m.replace(/[.,:/-]+$/, "");
    if (v && !hay.includes(v.toLowerCase())) out.add(v);
  }
  for (const sentence of draft.split(/(?<=[.!?:;])\s+|\n+/)) {
    const ws = sentence.split(/\s+/).filter(Boolean);
    ws.forEach((raw, i) => {
      const w = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!w || COMMON_CAPS.has(w)) return;
      const isAcronym = /^[A-Z0-9]{2,}$/.test(w) && /[A-Z]/.test(w);
      const isName = /^\p{Lu}/u.test(w) && (i > 0 || !STARTERS.has(w.toLowerCase()));
      if ((isAcronym || isName) && !hay.includes(w.toLowerCase())) out.add(w);
    });
  }
  return [...out];
}

import { cache } from "react";
import { cookies } from "next/headers";
import type { Access, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/* ------------------------------------------------------------------------- */
/* Personas (demo identity, no login)                                         */
/* ------------------------------------------------------------------------- */

export const PERSONA_COOKIE = "baton_persona";

export const PERSONAS = {
  meera: {
    key: "meera",
    name: "Meera Kulkarni",
    role: "OWNER",
    roleTitle: "Tech lead (departing)",
  },
  rao: {
    key: "rao",
    name: "Prof. S. Rao",
    role: "REVIEWER",
    roleTitle: "Faculty coordinator",
  },
  arjun: {
    key: "arjun",
    name: "Arjun Mehta",
    role: "INCOMING",
    roleTitle: "Incoming tech lead",
  },
  kabir: {
    key: "kabir",
    name: "Kabir Shah",
    role: "OBSERVER",
    roleTitle: "Club member",
  },
} as const satisfies Record<
  string,
  { key: string; name: string; role: Role; roleTitle: string }
>;

export type PersonaKey = keyof typeof PERSONAS;
/** A persona as seen inside one project: the role is fixed, the name/title come from the project's People. */
export type Actor = { key: PersonaKey; name: string; role: Role; roleTitle: string };

/** Person.handles marker that maps a demo persona onto a project's own person (set by /new). */
export const personaHandle = (key: PersonaKey) => `persona:${key}`;

export const DEFAULT_PERSONA: PersonaKey = "meera";

export function isPersonaKey(v: unknown): v is PersonaKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PERSONAS, v);
}

export function personaFromKey(v: unknown): Actor {
  return PERSONAS[isPersonaKey(v) ? v : DEFAULT_PERSONA];
}

/**
 * Personas of one project. New projects map each persona onto the person entered in the /new
 * People step (Person.handles contains `persona:<key>`); FestFlow and unmapped personas keep
 * their default names. Cached per request.
 */
export const projectPersonas = cache(async (slug: string): Promise<Record<PersonaKey, Actor>> => {
  const out = { ...PERSONAS } as Record<PersonaKey, Actor>;
  const people = await prisma.person.findMany({
    where: { project: { slug }, handles: { hasSome: Object.keys(PERSONAS).map((k) => personaHandle(k as PersonaKey)) } },
    select: { name: true, roleTitle: true, handles: true },
  });
  const mapped = people.length > 0; // a project created in /new: its people replace the sample cast
  for (const key of Object.keys(PERSONAS) as PersonaKey[]) {
    const p = people.find((x) => x.handles.includes(personaHandle(key)));
    if (p) out[key] = { ...PERSONAS[key], name: p.name, roleTitle: p.roleTitle };
    else if (mapped) out[key] = { ...PERSONAS[key], name: "Observer", roleTitle: "Read-only viewer" }; // never show the sample cast in another project
  }
  return out;
});

/**
 * Current demo actor from the "Viewing as" cookie (server only). With a project slug, the
 * persona's name is the project's own person (see projectPersonas).
 */
export async function getActor(slug?: string): Promise<Actor> {
  const jar = await cookies();
  const base = personaFromKey(jar.get(PERSONA_COOKIE)?.value);
  if (!slug) return base;
  try {
    return (await projectPersonas(slug))[base.key];
  } catch {
    return base;
  }
}

/* ------------------------------------------------------------------------- */
/* Permission matrix (mirrors CLAUDE.md exactly)                              */
/* ------------------------------------------------------------------------- */

export const ACTIONS = [
  "connect_sources",
  "label_sources",
  "see_restricted",
  "see_team",
  "edit_claims",
  "reject_claims",
  "resolve_conflicts",
  "answer_interview",
  "answer_followups",
  "approve_version",
  "acknowledge",
  "ask_followups",
] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  OWNER: new Set<Action>([
    "connect_sources",
    "label_sources",
    "see_restricted",
    "see_team",
    "edit_claims",
    "reject_claims",
    "resolve_conflicts",
    "answer_interview",
    "answer_followups",
  ]),
  REVIEWER: new Set<Action>([
    "see_restricted",
    "see_team",
    "edit_claims",
    "reject_claims",
    "resolve_conflicts",
    "approve_version",
  ]),
  // INCOMING sees RESTRICTED only per granted source: see allowedAccess().
  INCOMING: new Set<Action>(["see_team", "acknowledge", "ask_followups"]),
  OBSERVER: new Set<Action>([]),
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role]?.has(action) ?? false;
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(
    readonly role: Role,
    readonly action: Action,
  ) {
    super(`${role} is not allowed to ${action.replace(/_/g, " ")}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(actor: { role: Role }, action: Action): void {
  if (!can(actor.role, action)) throw new ForbiddenError(actor.role, action);
}

/* ------------------------------------------------------------------------- */
/* Data access levels                                                         */
/* ------------------------------------------------------------------------- */

export const ACCESS_RANK: Record<Access, number> = {
  PUBLIC: 0,
  TEAM: 1,
  RESTRICTED: 2,
};

export function maxAccess(levels: Access[]): Access {
  return levels.reduce<Access>(
    (m, a) => (ACCESS_RANK[a] > ACCESS_RANK[m] ? a : m),
    "PUBLIC",
  );
}

/** Blanket access levels per role (before per-source grants). */
export function accessLevelsFor(role: Role): Access[] {
  switch (role) {
    case "OWNER":
    case "REVIEWER":
      return ["PUBLIC", "TEAM", "RESTRICTED"];
    case "INCOMING":
      return ["PUBLIC", "TEAM"];
    case "OBSERVER":
      return ["PUBLIC"];
    default:
      return [];
  }
}

export type AllowedAccess = {
  role: Role;
  levels: Access[];
  /** RESTRICTED sources explicitly granted to this role (INCOMING only). */
  grantedSourceIds: string[];
};

/** Pure check: may a viewer with `allowed` see this chunk/source? */
export function canSeeChunk(
  allowed: AllowedAccess,
  chunk: { access: Access; sourceId: string },
): boolean {
  if (allowed.levels.includes(chunk.access)) return true;
  return (
    chunk.access === "RESTRICTED" &&
    allowed.grantedSourceIds.includes(chunk.sourceId)
  );
}

/** A claim is visible only if every evidence chunk is visible. */
export function canSeeClaim(
  allowed: AllowedAccess,
  claim: { access: Access; evidence: { chunk: { access: Access; sourceId: string } }[] },
): boolean {
  if (claim.evidence.length === 0) return allowed.levels.includes(claim.access);
  return claim.evidence.every((e) => canSeeChunk(allowed, e.chunk));
}

export async function allowedAccess(
  role: Role,
  projectId: string,
): Promise<AllowedAccess> {
  const levels = accessLevelsFor(role);
  let grantedSourceIds: string[] = [];
  if (role === "INCOMING") {
    const granted = await prisma.source.findMany({
      where: { projectId, access: "RESTRICTED", grantedToIncoming: true },
      select: { id: true },
    });
    grantedSourceIds = granted.map((s) => s.id);
  }
  return { role, levels, grantedSourceIds };
}

/* ------------------------------------------------------------------------- */
/* Audit                                                                      */
/* ------------------------------------------------------------------------- */

type AuditDb = Pick<typeof prisma, "auditLog">;

export async function writeAudit(
  db: AuditDb | Prisma.TransactionClient,
  entry: {
    projectId: string;
    actor: { name: string; role: Role | "SYSTEM" };
    action: string;
    targetType: string;
    targetId?: string | null;
    meta?: Prisma.InputJsonValue;
  },
) {
  return db.auditLog.create({
    data: {
      projectId: entry.projectId,
      actorName: entry.actor.name,
      actorRole: entry.actor.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      meta: entry.meta ?? {},
    },
  });
}

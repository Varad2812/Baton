import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  ACTIONS,
  type Action,
  type AllowedAccess,
  PERSONAS,
  accessLevelsFor,
  assertCan,
  can,
  canSeeChunk,
  canSeeClaim,
  ForbiddenError,
  maxAccess,
  personaFromKey,
} from "./authz";
import type { Role } from "@/generated/prisma/enums";

// Expected matrix, transcribed from CLAUDE.md "Permission matrix".
const EXPECTED: Record<Action, Record<Role, boolean>> = {
  connect_sources: { OWNER: true, REVIEWER: false, INCOMING: false, OBSERVER: false },
  label_sources: { OWNER: true, REVIEWER: false, INCOMING: false, OBSERVER: false },
  see_restricted: { OWNER: true, REVIEWER: true, INCOMING: false, OBSERVER: false },
  see_team: { OWNER: true, REVIEWER: true, INCOMING: true, OBSERVER: false },
  edit_claims: { OWNER: true, REVIEWER: true, INCOMING: false, OBSERVER: false },
  reject_claims: { OWNER: true, REVIEWER: true, INCOMING: false, OBSERVER: false },
  resolve_conflicts: { OWNER: true, REVIEWER: true, INCOMING: false, OBSERVER: false },
  answer_interview: { OWNER: true, REVIEWER: false, INCOMING: false, OBSERVER: false },
  answer_followups: { OWNER: true, REVIEWER: false, INCOMING: false, OBSERVER: false },
  approve_version: { OWNER: false, REVIEWER: true, INCOMING: false, OBSERVER: false },
  acknowledge: { OWNER: false, REVIEWER: false, INCOMING: true, OBSERVER: false },
  ask_followups: { OWNER: false, REVIEWER: false, INCOMING: true, OBSERVER: false },
};

const ROLES: Role[] = ["OWNER", "REVIEWER", "INCOMING", "OBSERVER"];

describe("permission matrix", () => {
  it("covers every action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
  });

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      const want = EXPECTED[action][role];
      it(`${role} ${want ? "can" : "cannot"} ${action}`, () => {
        expect(can(role, action)).toBe(want);
      });
    }
  }

  it("owner cannot self-approve", () => {
    expect(can("OWNER", "approve_version")).toBe(false);
  });

  it("observer is read-only", () => {
    for (const a of ACTIONS) expect(can("OBSERVER", a)).toBe(false);
  });

  it("assertCan throws ForbiddenError", () => {
    expect(() => assertCan({ role: "INCOMING" }, "edit_claims")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "REVIEWER" }, "approve_version")).not.toThrow();
  });
});

describe("personas", () => {
  it("map to the four roles", () => {
    expect(PERSONAS.meera.role).toBe("OWNER");
    expect(PERSONAS.rao.role).toBe("REVIEWER");
    expect(PERSONAS.arjun.role).toBe("INCOMING");
    expect(PERSONAS.kabir.role).toBe("OBSERVER");
  });
  it("fall back to the default for unknown cookies", () => {
    expect(personaFromKey("nope").key).toBe("meera");
    expect(personaFromKey(undefined).key).toBe("meera");
    expect(personaFromKey("__proto__").key).toBe("meera");
    expect(personaFromKey("arjun").key).toBe("arjun");
  });
});

describe("access levels", () => {
  it("per role", () => {
    expect(accessLevelsFor("OWNER")).toEqual(["PUBLIC", "TEAM", "RESTRICTED"]);
    expect(accessLevelsFor("REVIEWER")).toEqual(["PUBLIC", "TEAM", "RESTRICTED"]);
    expect(accessLevelsFor("INCOMING")).toEqual(["PUBLIC", "TEAM"]);
    expect(accessLevelsFor("OBSERVER")).toEqual(["PUBLIC"]);
  });

  it("maxAccess", () => {
    expect(maxAccess([])).toBe("PUBLIC");
    expect(maxAccess(["PUBLIC", "TEAM"])).toBe("TEAM");
    expect(maxAccess(["TEAM", "RESTRICTED", "PUBLIC"])).toBe("RESTRICTED");
  });

  const incoming = (granted: string[]): AllowedAccess => ({
    role: "INCOMING",
    levels: accessLevelsFor("INCOMING"),
    grantedSourceIds: granted,
  });
  const observer: AllowedAccess = {
    role: "OBSERVER",
    levels: accessLevelsFor("OBSERVER"),
    grantedSourceIds: [],
  };

  it("incoming sees RESTRICTED only from granted sources", () => {
    const chunk = { access: "RESTRICTED" as const, sourceId: "src_budget" };
    expect(canSeeChunk(incoming([]), chunk)).toBe(false);
    expect(canSeeChunk(incoming(["src_budget"]), chunk)).toBe(true);
    expect(canSeeChunk(incoming(["src_other"]), chunk)).toBe(false);
  });

  it("observer sees PUBLIC only", () => {
    expect(canSeeChunk(observer, { access: "PUBLIC", sourceId: "a" })).toBe(true);
    expect(canSeeChunk(observer, { access: "TEAM", sourceId: "a" })).toBe(false);
  });

  it("a claim is hidden if any evidence chunk is hidden", () => {
    const claim = {
      access: "RESTRICTED" as const,
      evidence: [
        { chunk: { access: "TEAM" as const, sourceId: "a" } },
        { chunk: { access: "RESTRICTED" as const, sourceId: "b" } },
      ],
    };
    expect(canSeeClaim(incoming([]), claim)).toBe(false);
    expect(canSeeClaim(incoming(["b"]), claim)).toBe(true);
    expect(canSeeClaim(observer, claim)).toBe(false);
  });
});

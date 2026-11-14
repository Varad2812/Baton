import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CreateProjectInput, GithubUrlSchema, SlugSchema, countRedactions, detectFile, slugify } from "./schema";

const sample = (name: string) => readFileSync(path.join(__dirname, "../../../public/samples", name), "utf8");

describe("slugs", () => {
  it("derives a slug from the name", () => {
    expect(slugify("Robotics Lab — Inventory 2.0!")).toBe("robotics-lab-inventory-2-0");
    expect(slugify("  MessMate  ")).toBe("messmate");
  });
  it("rejects reserved and malformed slugs", () => {
    expect(SlugSchema.safeParse("festflow").success).toBe(false);
    expect(SlugSchema.safeParse("ab").success).toBe(false);
    expect(SlugSchema.safeParse("Bad Slug").success).toBe(false);
    expect(SlugSchema.safeParse("mess-mate").success).toBe(true);
  });
});

describe("create project input", () => {
  const person = (name: string) => ({ name, roleTitle: "Lead" });
  const base = { name: "MessMate", slug: "messmate", description: "Hostel mess menu and ratings." };
  it("accepts three distinct people", () => {
    const r = CreateProjectInput.safeParse({ ...base, people: { departing: person("Riya"), incoming: person("Omkar"), reviewer: person("Dr. Menon") } });
    expect(r.success).toBe(true);
  });
  it("blocks self-approval (reviewer = departing, case-insensitive)", () => {
    const r = CreateProjectInput.safeParse({ ...base, people: { departing: person("Riya D"), incoming: person("Omkar"), reviewer: person("riya d") } });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["people", "reviewer", "name"]);
  });
});

describe("github url", () => {
  it("accepts owner/repo URLs only", () => {
    expect(GithubUrlSchema.safeParse("https://github.com/vercel/next.js").success).toBe(true);
    expect(GithubUrlSchema.safeParse("github.com/vercel/next.js").success).toBe(false);
    expect(GithubUrlSchema.safeParse("https://github.com/vercel").success).toBe(false);
  });
});

describe("file detection on the bundled samples", () => {
  it("detects the Discord export as a chat with redactions", () => {
    const d = detectFile("messmate-chat-export.json", sample("messmate-chat-export.json"));
    expect(d.kind).toBe("CHAT");
    expect(d.detail).toBe("16 messages · #dev · 3 authors");
    expect(d.toRedact).toBe(2); // fake mmk_live_ token + contractor email
  });
  it("detects the Trello CSV as tasks", () => {
    const d = detectFile("messmate-tasks.csv", sample("messmate-tasks.csv"));
    expect(d.kind).toBe("TASKS");
    expect(d.detail).toBe("10 cards · 4 lists");
  });
  it("detects the meeting note as notes", () => {
    expect(detectFile("messmate-meeting-2026-09-18.md", sample("messmate-meeting-2026-09-18.md")).kind).toBe("NOTES");
  });
  it("suggests Restricted for budget-like files and counts phones/emails once", () => {
    const d = detectFile("sponsor-budget.csv", "Sponsor,Phone\nAcme,+91 98220 12345\nAcme,+91 98220 12345\nZed,zed@example.com\n");
    expect(d.suggestedAccess).toBe("RESTRICTED");
    expect(d.kind).toBe("DOC");
    expect(d.toRedact).toBe(2);
  });
  it("does not double-count a token inside a KEY= assignment", () => {
    expect(countRedactions("MESS_ADMIN_TOKEN=mmk_live_9Qx7Lr2Vt8Nw4Kz1Pd6H")).toBe(1);
  });
});

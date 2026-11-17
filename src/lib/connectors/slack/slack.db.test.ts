// Local-DB integration: the FestFlow sample Slack export through the one Slack importer.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PERSONAS } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { leakageReport } from "@/lib/handover/service";
import { resetSandbox } from "@/lib/sandbox";
import { importSlackExport, slackImpact } from "./service";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const zip = () => new Uint8Array(readFileSync(path.join(process.cwd(), "public/samples/festflow-slack-export.zip")));

describe.skipIf(!local)("Slack export import (local DB)", () => {
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { visitorId: "vitest-slack-0001" } });
    await prisma.$disconnect();
  });

  it("maps visibility, confirms facts from a second source, is idempotent and leaks nothing", async () => {
    const p = await resetSandbox("vitest-slack-0001");
    expect(await slackImpact(p.id)).toBeNull();

    const r = await importSlackExport({ ...PERSONAS.meera }, p, zip(), "festflow-slack-export.zip");
    expect(r.imported.map((c) => [c.name, c.access])).toEqual([
      ["festflow-dev", "TEAM"],
      ["festflow-payments", "TEAM"],
      ["core-sponsors", "RESTRICTED"],
    ]);
    expect(r.result?.confirmed).toHaveLength(6);
    expect(r.result?.newFacts).toHaveLength(1);

    const impact = await slackImpact(p.id);
    expect(impact!.after).toBeGreaterThan(impact!.before);
    expect(impact!.after - impact!.before).toBe(6);

    const sponsor = await prisma.claim.findFirst({ where: { projectId: p.id, topicKey: "sponsor_amount" } });
    expect(sponsor?.access).toBe("RESTRICTED");
    const leak = await leakageReport(p.id);
    expect(leak.totalHits).toBe(0);
    expect(leak.results.find((x) => x.role === "INCOMING")!.canaries).toContain("CANARY-SL-9C2E");

    const before = await prisma.chunk.count({ where: { source: { projectId: p.id } } });
    const again = await importSlackExport({ ...PERSONAS.meera }, p, zip(), "festflow-slack-export.zip");
    expect(again.result?.runId ?? null).toBeNull();
    expect(again.result?.ingest.newItems ?? 0).toBe(0);
    expect(await prisma.chunk.count({ where: { source: { projectId: p.id } } })).toBe(before);
  }, 60_000);
});

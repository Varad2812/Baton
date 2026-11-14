import { describe, expect, it } from "vitest";
import PIPELINE_CACHE from "../../../seed/pipeline-cache.json";
import { busFactorFromCommits } from "@/lib/views/dashboard";
import { areaOf, commitsByArea, parseCommitChunks } from "./commits";

const commitSources = new Set(PIPELINE_CACHE.sources.filter((s) => s.kind === "GITHUB_COMMIT").map((s) => s.id));
const commitChunks = PIPELINE_CACHE.chunks.filter((c) => commitSources.has(c.sourceId));

describe("commit parsing", () => {
  it("parses all 60 FestFlow commits with authors and files", () => {
    const commits = parseCommitChunks(commitChunks);
    expect(commits).toHaveLength(60);
    expect(commits.every((c) => c.name && c.files.length > 0)).toBe(true);
  });

  it("maps files to areas", () => {
    expect(areaOf("services/email-templates/src/send.ts")).toBe("services/email-templates");
    expect(areaOf("docs/architecture.md")).toBe("docs");
    expect(areaOf("README.md")).toBeNull();
  });

  it("dashboard bus factor and single-owner detection agree: email-templates is Meera 23/23", () => {
    const et = commitsByArea(parseCommitChunks(commitChunks)).get("services/email-templates")!;
    expect(et).toHaveLength(23);
    const own = busFactorFromCommits(commitChunks).find((o) => o.area === "services/email-templates")!;
    expect(own.top).toEqual({ name: "Meera Kulkarni", commits: 23, share: 1 });
    expect(own.busFactor).toBe(1);
  });
});

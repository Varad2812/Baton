// Loads the FestFlow fixture folder into RawSources (keys, access labels, authority).
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  chatSources,
  commitsSource,
  type ChatExport,
  type GhCommit,
  type GhIssue,
  type GhPull,
  issueSource,
  markdownSource,
  pullSource,
  sheetSource,
  trelloSource,
} from "../../src/lib/pipeline/adapters";
import type { PersonInput, RawSource } from "../../src/lib/pipeline/normalise";

export const SEED_DIR = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(SEED_DIR, p), "utf8");
const json = <T>(p: string) => JSON.parse(read(p)) as T;
const d = (s: string) => new Date(`${s}T09:00:00+05:30`);

export const REPO = "festflow-club/festflow";

export function loadPeople(): PersonInput[] {
  return json<PersonInput[]>("people.json");
}

export function loadFestflowSources(): RawSource[] {
  const sources: RawSource[] = [];

  sources.push(commitsSource("src_commits", REPO, json<GhCommit[]>("github/commits.json")));

  for (const pr of [...json<GhPull[]>("github/pulls.json")].sort((a, b) => a.number - b.number)) {
    sources.push(pullSource(`src_pr_${pr.number}`, pr));
  }
  for (const is of [...json<GhIssue[]>("github/issues.json")].sort((a, b) => a.number - b.number)) {
    sources.push(issueSource(`src_issue_${is.number}`, is));
  }

  const docs: {
    key: string;
    file: string;
    title: string;
    access: RawSource["access"];
    authoritative: boolean;
    author: string;
    date: string;
  }[] = [
    { key: "src_doc_readme", file: "docs/README.md", title: "README.md", access: "PUBLIC", authoritative: false, author: "meera-k", date: "2026-01-05" },
    { key: "src_doc_architecture", file: "docs/architecture.md", title: "docs/architecture.md", access: "TEAM", authoritative: false, author: "meera-k", date: "2026-01-18" },
    { key: "src_notes_0210", file: "docs/meeting-notes/2026-02-10.md", title: "Meeting notes 10-Feb (draft)", access: "TEAM", authoritative: false, author: "arjun-mehta", date: "2026-02-10" },
    { key: "src_notes_0314", file: "docs/meeting-notes/2026-03-14.md", title: "Meeting notes 14-Mar (approved)", access: "TEAM", authoritative: true, author: "meera-k", date: "2026-03-14" },
    { key: "src_notes_0402", file: "docs/meeting-notes/2026-04-02.md", title: "Meeting notes 02-Apr (approved)", access: "TEAM", authoritative: true, author: "devp", date: "2026-04-02" },
  ];
  for (const doc of docs) {
    sources.push(
      markdownSource(
        {
          key: doc.key,
          title: doc.title,
          uri: `seed/${doc.file}`,
          access: doc.access,
          authoritative: doc.authoritative,
          author: doc.author,
          createdAt: d(doc.date),
        },
        read(doc.file),
      ),
    );
  }

  const chatAccess: Record<string, RawSource["access"]> = {
    general: "PUBLIC",
    dev: "TEAM",
    payments: "TEAM",
  };
  sources.push(
    ...chatSources(json<ChatExport>("chat/discord-export.json"), (name) => ({
      key: `src_chat_${name}`,
      access: chatAccess[name] ?? "TEAM",
    })),
  );

  sources.push(
    trelloSource(
      {
        key: "src_trello",
        title: "Trello · FestFlow 2026 board",
        uri: "seed/tasks/trello-board.csv",
        access: "TEAM",
        authoritative: false,
        createdAt: d("2026-04-23"),
      },
      read("tasks/trello-board.csv"),
    ),
  );

  sources.push(
    sheetSource(
      {
        key: "src_budget",
        title: "Budget and sponsors sheet",
        uri: "seed/restricted/budget-sponsors.csv",
        access: "RESTRICTED",
        authoritative: false,
        author: "devp",
        createdAt: d("2026-04-19"),
        grantedToIncoming: false,
      },
      read("restricted/budget-sponsors.csv"),
    ),
  );

  return sources;
}

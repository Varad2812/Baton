"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Field, TextInput } from "./fields";
import { NextPanel, ProgressRail, type RailStep } from "./rail";
import { RunStep } from "./run-step";
import { SourcesStep, type FileEntry } from "./sources-step";
import {
  ALLOWED_EXT,
  GithubUrlSchema,
  MAX_FILE_BYTES,
  MAX_FILES,
  PeopleSchema,
  ProjectSchema,
  detectFile,
  extOf,
  fieldErrorsOf,
  slugify,
  type AccessLevel,
} from "./schema";
import { useBuildRun } from "./use-build-run";

type Person = { name: string; roleTitle: string };
type People = { departing: Person; incoming: Person; reviewer: Person };

const EMPTY_PERSON: Person = { name: "", roleTitle: "" };

const SAMPLES = [
  { url: "/samples/messmate-meeting-2026-09-18.md", name: "messmate-meeting-2026-09-18.md", type: "text/markdown" },
  { url: "/samples/messmate-chat-export.json", name: "messmate-chat-export.json", type: "application/json" },
  { url: "/samples/messmate-tasks.csv", name: "messmate-tasks.csv", type: "text/csv" },
];

const SAMPLE_PROJECT = {
  name: "MessMate",
  description: "Hostel mess menu, meal ratings and complaints for Blocks A–E.",
};
const SAMPLE_PEOPLE: People = {
  departing: { name: "Riya Deshpande", roleTitle: "Tech lead (graduating)" },
  incoming: { name: "Omkar Joshi", roleTitle: "Incoming tech lead" },
  reviewer: { name: "Dr. Nisha Menon", roleTitle: "Hostel warden" },
};

const STEP_TITLES = ["Project", "People", "Sources", "Run"];

const PEOPLE_ROWS = [
  { key: "departing", role: "OWNER", label: "Departing person", does: "Answers the gap interview; can't approve their own handover", namePh: "Full name", titlePh: "e.g. Tech lead (graduating)" },
  { key: "incoming", role: "INCOMING", label: "Incoming person", does: "Reads the role-compiled handover, acknowledges sections, asks follow-ups", namePh: "Full name", titlePh: "e.g. Incoming tech lead" },
  { key: "reviewer", role: "REVIEWER", label: "Reviewer", does: "Edits claims, resolves conflicts and approves an immutable version", namePh: "Full name", titlePh: "e.g. Faculty coordinator" },
] as const;

async function readText(file: File): Promise<string | null> {
  if (extOf(file.name) === "docx") return null;
  try {
    return await file.text();
  } catch {
    return null;
  }
}

export function NewProjectWizard() {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [project, setProject] = useState({ name: "", slug: "", description: "" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [people, setPeople] = useState<People>({ departing: EMPTY_PERSON, incoming: EMPTY_PERSON, reviewer: EMPTY_PERSON });
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [githubUrl, setGithubUrl] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [sample, setSample] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const build = useBuildRun();
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the step heading on step change (not on first load) so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step]);

  const projectErrors = useMemo(() => {
    const r = ProjectSchema.safeParse(project);
    return r.success ? {} : fieldErrorsOf(r.error);
  }, [project]);

  const peopleErrors = useMemo(() => {
    const r = PeopleSchema.safeParse(people);
    return r.success ? {} : fieldErrorsOf(r.error);
  }, [people]);

  const sourceErrors = useMemo(() => {
    const out: Record<string, string> = {};
    if (githubUrl.trim()) {
      const r = GithubUrlSchema.safeParse(githubUrl);
      if (!r.success) out.githubUrl = r.error.issues[0]?.message ?? "Invalid URL";
    }
    if (files.length === 0 && !githubUrl.trim()) out.files = "Add at least one file or a public GitHub repo URL";
    return out;
  }, [files.length, githubUrl]);

  const valid = [
    Object.keys(projectErrors).length === 0,
    Object.keys(peopleErrors).length === 0,
    Object.keys(sourceErrors).length === 0,
    true,
  ];

  const show = (stepIdx: number, key: string, errors: Record<string, string>) =>
    touched[key] || attempted[stepIdx] ? errors[key] : undefined;
  const touch = (key: string) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));

  const go = useCallback((i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
  }, []);

  const next = () => {
    setAttempted((a) => ({ ...a, [step]: true }));
    if (!valid[step]) {
      // Focus the first invalid field.
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    go(step + 1);
  };

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  /** Validates and detects each file; `replace` swaps same-named files (used by the sample loader). */
  const addFiles = useCallback(async (incoming: File[], opts?: { sample?: boolean; replace?: boolean }) => {
    const skipped: { name: string; reason: string }[] = [];
    const accepted: FileEntry[] = [];
    const incomingNames = new Set(incoming.map((f) => f.name));
    const kept = opts?.replace ? filesRef.current.filter((f) => !incomingNames.has(f.file.name)) : filesRef.current;
    const names = new Set(kept.map((f) => f.file.name));
    for (const file of incoming) {
      if (!(ALLOWED_EXT as readonly string[]).includes(extOf(file.name))) skipped.push({ name: file.name, reason: "unsupported type (use .md .txt .csv .json .docx)" });
      else if (file.size === 0) skipped.push({ name: file.name, reason: "empty file" });
      else if (file.size > MAX_FILE_BYTES) skipped.push({ name: file.name, reason: `larger than 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)` });
      else if (names.has(file.name)) skipped.push({ name: file.name, reason: "already added" });
      else if (kept.length + accepted.length >= MAX_FILES) skipped.push({ name: file.name, reason: `limit of ${MAX_FILES} files reached` });
      else {
        names.add(file.name);
        const detection = detectFile(file.name, await readText(file));
        accepted.push({ id: `${file.name}:${file.size}:${file.lastModified}`, file, detection, access: detection.suggestedAccess, sample: opts?.sample });
      }
    }
    const nextFiles = [...kept, ...accepted];
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    setRejected(skipped);
  }, []);

  const loadSamples = async () => {
    setSample("loading");
    try {
      const loaded = await Promise.all(
        SAMPLES.map(async (s) => {
          const res = await fetch(s.url, { cache: "force-cache" });
          if (!res.ok) throw new Error(`${s.name}: ${res.status}`);
          return new File([await res.blob()], s.name, { type: s.type, lastModified: Date.UTC(2026, 9, 5) });
        }),
      );
      await addFiles(loaded, { sample: true, replace: true });
      setProject((p) =>
        p.name.trim()
          ? p
          : { name: SAMPLE_PROJECT.name, slug: slugEdited && p.slug ? p.slug : slugify(SAMPLE_PROJECT.name), description: p.description || SAMPLE_PROJECT.description },
      );
      setPeople((p) => ({
        departing: p.departing.name.trim() ? p.departing : SAMPLE_PEOPLE.departing,
        incoming: p.incoming.name.trim() ? p.incoming : SAMPLE_PEOPLE.incoming,
        reviewer: p.reviewer.name.trim() ? p.reviewer : SAMPLE_PEOPLE.reviewer,
      }));
      setSample("loaded");
      setReached((r) => Math.max(r, 2));
      setStep(2);
    } catch {
      setSample("error");
    }
  };

  const setPerson = (key: keyof People, field: keyof Person, value: string) =>
    setPeople((p) => ({ ...p, [key]: { ...p[key], [field]: value } }));

  const rail: RailStep[] = STEP_TITLES.map((title, i) => {
    const sub =
      i === 0
        ? project.name.trim() || "Name, slug, one-liner"
        : i === 1
          ? people.departing.name && people.incoming.name
            ? `${people.departing.name.split(" ")[0]} → ${people.incoming.name.split(" ")[0]}`
            : "Departing, incoming, reviewer"
          : i === 2
            ? files.length || githubUrl
              ? [files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : null, githubUrl ? "GitHub" : null].filter(Boolean).join(" + ")
              : "Uploads, GitHub repo"
            : build.status === "unavailable"
              ? "Sources saved · model needed"
              : build.status === "done"
                ? "Handover drafted"
                : "Build the handover";
    const enabled = i <= reached || valid.slice(0, i).every(Boolean);
    const state: RailStep["state"] =
      i === step ? "current" : attempted[i] && !valid[i] ? "invalid" : i < reached && valid[i] ? "done" : i <= reached && valid[i] && i < 3 ? "done" : "upcoming";
    return { title, sub, state, enabled };
  });

  const stepDescription = [
    "What the handover is for. The slug becomes the project's address.",
    "Who leaves, who takes over, and who signs off. The reviewer can't be the person leaving.",
    "Label each source before anything is read. Labels decide which role's handover may use it.",
    "Check the summary, then build. Stages stream in as they finish.",
  ][step];

  return (
    <div className="mx-auto grid w-full max-w-[1320px] grid-cols-[208px_minmax(0,1fr)_296px] gap-6 px-6 pb-16 pt-6">
      <ProgressRail steps={rail} onSelect={(i) => go(i)} />

      <div className="min-w-0">
        <div className="flex items-end justify-between gap-6 pb-5">
          <div className="min-w-0">
            <h1 className="font-serif text-[26px] font-semibold leading-tight tracking-tight text-text">Start a handover</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-muted">
              Connect what the departing person leaves behind. Baton rebuilds the project&apos;s state, grades every claim against a quoted
              source and asks them only what the records can&apos;t answer.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button variant="outline" onClick={loadSamples} disabled={sample === "loading"} data-testid="try-samples">
              {sample === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
              Try with sample files
            </Button>
            {sample === "error" ? (
              <button type="button" onClick={loadSamples} className="text-xs text-conflicting hover:underline">
                Couldn&apos;t load samples. Retry
              </button>
            ) : (
              <span className="font-mono text-[11px] text-subtle">3 files · notes, chat, tasks</span>
            )}
          </div>
        </div>

        <section className="rounded-lg border border-border bg-surface" aria-labelledby="step-heading">
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-5 py-2.5">
            <div className="min-w-0">
              <h2 id="step-heading" ref={heading} tabIndex={-1} className="text-[13px] font-semibold text-text outline-none">
                <span className="font-mono text-subtle">
                  {step + 1}/{STEP_TITLES.length}
                </span>{" "}
                {STEP_TITLES[step]}
              </h2>
              <p className="mt-0.5 text-xs text-subtle">{stepDescription}</p>
            </div>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 3) next();
            }}
          >
            <div key={step} className="px-5 py-5 animate-in fade-in duration-200">
              {step === 0 && (
                <div className="grid max-w-[640px] gap-4">
                  <Field id="p-name" label="Project name" error={show(0, "name", projectErrors)}>
                    <TextInput
                      id="p-name"
                      autoFocus
                      value={project.name}
                      invalid={!!show(0, "name", projectErrors)}
                      placeholder="e.g. Library seat booking"
                      onChange={(e) => {
                        const name = e.target.value;
                        setProject((p) => ({ ...p, name, slug: slugEdited ? p.slug : slugify(name) }));
                      }}
                      onBlur={() => touch("name")}
                    />
                  </Field>
                  <Field
                    id="p-slug"
                    label="Slug"
                    error={show(0, "slug", projectErrors)}
                    aside={slugEdited ? "edited" : "auto from name"}
                    hint={
                      slugEdited ? (
                        <button
                          type="button"
                          className="text-muted underline-offset-2 hover:text-text hover:underline"
                          onClick={() => {
                            setSlugEdited(false);
                            setProject((p) => ({ ...p, slug: slugify(p.name) }));
                          }}
                        >
                          Reset to match the name
                        </button>
                      ) : (
                        "Lowercase letters, numbers and hyphens."
                      )
                    }
                  >
                    <div
                      className={cn(
                        "flex h-8 items-center overflow-hidden rounded-md border bg-bg focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/30",
                        show(0, "slug", projectErrors) ? "border-conflicting/60" : "border-border",
                      )}
                    >
                      <span className="flex h-full items-center border-r border-border bg-surface-2/60 px-2.5 font-mono text-[12px] text-subtle">/p/</span>
                      <input
                        id="p-slug"
                        value={project.slug}
                        aria-invalid={!!show(0, "slug", projectErrors) || undefined}
                        aria-describedby={show(0, "slug", projectErrors) ? "p-slug-error" : "p-slug-hint"}
                        onChange={(e) => {
                          setSlugEdited(true);
                          setProject((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }));
                        }}
                        onBlur={() => touch("slug")}
                        placeholder="library-seats"
                        spellCheck={false}
                        autoComplete="off"
                        className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[12px] text-text outline-none placeholder:text-subtle"
                      />
                    </div>
                  </Field>
                  <Field
                    id="p-desc"
                    label="One-line description"
                    aside={`${project.description.length}/140`}
                    error={show(0, "description", projectErrors)}
                    hint="Shown at the top of the handover, e.g. what it does and who uses it."
                  >
                    <TextInput
                      id="p-desc"
                      maxLength={140}
                      value={project.description}
                      invalid={!!show(0, "description", projectErrors)}
                      placeholder="e.g. Seat booking for the central library, used by 3,000 students"
                      onChange={(e) => setProject((p) => ({ ...p, description: e.target.value }))}
                      onBlur={() => touch("description")}
                    />
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="divide-y divide-border rounded-md border border-border">
                  {PEOPLE_ROWS.map((row, idx) => {
                    const nameKey = `${row.key}.name`;
                    const titleKey = `${row.key}.roleTitle`;
                    return (
                      <div key={row.key} className="grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 py-3.5">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-text">{row.label}</span>
                            <span className="rounded bg-surface-2 px-1 font-mono text-[10px] uppercase tracking-wide text-muted">{row.role}</span>
                          </div>
                          <p className="mt-0.5 text-xs leading-snug text-subtle">{row.does}</p>
                        </div>
                        <Field id={`${row.key}-name`} label="Name" error={show(1, nameKey, peopleErrors)}>
                          <TextInput
                            id={`${row.key}-name`}
                            autoFocus={idx === 0}
                            value={people[row.key].name}
                            invalid={!!show(1, nameKey, peopleErrors)}
                            placeholder={row.namePh}
                            onChange={(e) => setPerson(row.key, "name", e.target.value)}
                            onBlur={() => touch(nameKey)}
                          />
                        </Field>
                        <Field id={`${row.key}-title`} label="Role title" error={show(1, titleKey, peopleErrors)}>
                          <TextInput
                            id={`${row.key}-title`}
                            value={people[row.key].roleTitle}
                            invalid={!!show(1, titleKey, peopleErrors)}
                            placeholder={row.titlePh}
                            onChange={(e) => setPerson(row.key, "roleTitle", e.target.value)}
                            onBlur={() => touch(titleKey)}
                          />
                        </Field>
                      </div>
                    );
                  })}
                </div>
              )}

              {step === 2 && (
                <SourcesStep
                  files={files}
                  rejected={rejected}
                  githubUrl={githubUrl}
                  githubError={show(2, "githubUrl", sourceErrors)}
                  filesError={attempted[2] ? sourceErrors.files : undefined}
                  sampleNotice={sample === "loaded" && files.some((f) => f.sample)}
                  onAddFiles={(fs) => void addFiles(fs)}
                  onRemove={(id) => setFiles((xs) => xs.filter((f) => f.id !== id))}
                  onAccess={(id, access: AccessLevel) => setFiles((xs) => xs.map((f) => (f.id === id ? { ...f, access } : f)))}
                  onGithubUrl={setGithubUrl}
                  onGithubBlur={() => touch("githubUrl")}
                  onClearRejected={() => setRejected([])}
                />
              )}

              {step === 3 && (
                <RunStep
                  project={project}
                  people={people}
                  files={files}
                  githubUrl={githubUrl.trim()}
                  run={build}
                  onEdit={go}
                  onReset={build.reset}
                  onBuild={() =>
                    void build.run({
                      project: { ...project, people },
                      files: files.map((f) => ({ file: f.file, access: f.access })),
                      githubUrl: githubUrl.trim() || undefined,
                    })
                  }
                />
              )}
            </div>

            {step < 3 && (
              <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                <div>
                  {step > 0 && (
                    <Button type="button" variant="ghost" onClick={() => go(step - 1)}>
                      <ArrowLeft className="size-3.5" />
                      Back
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {attempted[step] && !valid[step] && (
                    <span className="text-xs text-conflicting" role="alert">
                      {Object.keys([projectErrors, peopleErrors, sourceErrors][step]).length} field
                      {Object.keys([projectErrors, peopleErrors, sourceErrors][step]).length === 1 ? " needs" : "s need"} attention
                    </span>
                  )}
                  <Button type="submit" data-testid="continue">
                    Continue to {STEP_TITLES[step + 1]}
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="flex items-center border-t border-border px-5 py-3">
                <Button type="button" variant="ghost" onClick={() => go(2)}>
                  <ArrowLeft className="size-3.5" />
                  Back to Sources
                </Button>
              </div>
            )}
          </form>
        </section>
      </div>

      <NextPanel step={step} />
    </div>
  );
}

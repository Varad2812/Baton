"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePeople } from "@/components/common/people-context";
import { Loader2, Mic, Square } from "lucide-react";
import { answerGapQuestion } from "@/app/_actions/interview";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Rec = {
  start(): void;
  stop(): void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

const noopSubscribe = () => () => {};

function getRecognition(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AnswerBox({ slug, questionId, canAnswer, placeholder }: { slug: string; questionId: string; canAnswer: boolean; placeholder: string }) {
  const people = usePeople();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  // null on the server, then whether this browser has Web Speech recognition.
  const supported = useSyncExternalStore<boolean | null>(
    noopSubscribe,
    () => !!getRecognition(),
    () => null,
  );
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const base = useRef("");
  const [pending, start] = useTransition();
  const toast = useActionToast();

  useEffect(() => () => rec.current?.stop(), []);

  const dictate = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = getRecognition();
    if (!R) return;
    const r = new R();
    r.lang = "en-IN";
    r.continuous = true;
    r.interimResults = true;
    base.current = text ? text.trimEnd() + " " : "";
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(base.current + s);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setErr(e.error === "not-allowed" ? "Microphone permission denied." : `Dictation stopped (${e.error}).`);
      setListening(false);
    };
    setErr(null);
    rec.current = r;
    r.start();
    setListening(true);
  };

  if (!canAnswer) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-subtle">
        Only {people.owner} (owner) answers the exit interview. Switch persona to answer.
      </p>
    );
  }

  const dictBtn = (
    <Button variant="outline" size="sm" onClick={dictate} disabled={!supported} aria-pressed={listening}>
      {listening ? <Square className="size-3 fill-current text-conflicting" /> : <Mic className="size-3.5" />}
      {listening ? "Stop" : "Dictate"}
    </Button>
  );

  return (
    <div className="space-y-2">
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Your answer"
        className={cn(
          "w-full rounded-md border bg-bg px-3 py-2 text-[13px] leading-relaxed text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30",
          listening ? "border-conflicting/50" : "border-border",
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {supported === false ? <Tooltip content="Web Speech dictation is not supported in this browser">{dictBtn}</Tooltip> : dictBtn}
          {listening && (
            <span className="inline-flex items-center gap-1.5 text-xs text-conflicting">
              <span className="size-1.5 animate-pulse rounded-full bg-conflicting" /> listening
            </span>
          )}
          {err && <span className="text-xs text-conflicting">{err}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-subtle">{text.length}/4000</span>
          <Button
            size="sm"
            disabled={pending || text.trim().length < 10}
            onClick={() =>
              start(async () => {
                const r = await answerGapQuestion({ slug, questionId, answer: text });
                toast(r, r.ok ? "Saved as testimony" : undefined);
                if (r.ok) setText("");
              })
            }
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Save as testimony
          </Button>
        </div>
      </div>
    </div>
  );
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERSONAS } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { resetSandbox } from "@/lib/sandbox";
import { approveVersion } from "@/lib/handover/service";
import { templateWriter } from "@/lib/handover/compile";
import { loadAskCorpus } from "./corpus";
import { composeAnswer } from "./compose";
import { retrieve } from "./retrieve";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local).sequential("successor evidence across a recorded change", () => {
  let id: string;
  beforeAll(async () => { id = (await resetSandbox("vitest-ask-receipts")).id; });
  afterAll(async () => { if (id) await prisma.project.delete({where:{id}}); });
  for (const mode of ["draft","approved"] as const) {
    it("cites the applicable source in the " + mode + " version",async () => {
      if (mode === "approved") await approveVersion(PERSONAS.rao,id,{override:true,note:"Synthetic review for citation regression test."},{writer:templateWriter});
      const corpus = await loadAskCorpus(PERSONAS.arjun,id);
      expect(corpus.mode).toBe(mode);
      for (const [question, current] of [["Which authentication service does FestFlow use now?",true],["Which authentication service did FestFlow use in January?",false]] as const) {
        const correct = current ? "clm_auth_supabase" : "clm_auth_firebase";
        const wrong = current ? "clm_auth_firebase" : "clm_auth_supabase";
        const ranked = retrieve(question,corpus);
        expect(ranked.claims.some(s=>s.doc.id.startsWith(correct)),question + ": " + ranked.claims.map(s=>s.doc.title).join(" / ")).toBe(true);
        expect(ranked.claims.some(s=>s.doc.id.startsWith(wrong))).toBe(false);
        const answer = await composeAnswer({question,corpus,role:"INCOMING",engines:[]});
        expect(answer.status).toBe("answered");
        expect(answer.sources.some(s=>s.claimId.startsWith(correct) && (current ? /Supabase/i : /Firebase/i).test(s.excerpt)),question + ": " + answer.sources.map(s=>s.label + " · " + s.excerpt).join(" / ")).toBe(true);
        for (const s of answer.sources.filter(s=>s.kind==="claim")) {
          const c = corpus.claims.find(c=>c.id===s.claimId);
          expect(c?.evidence?.some(e=>e.label===s.label && e.quote.startsWith(s.excerpt.replace(/…$/,"")))).toBe(true);
        }
      }
    });
  }
});

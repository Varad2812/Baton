// Make the public read-only sample from a disposable, local FestFlow copy using the normal approval and role compiler.
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { PERSONAS } from "../src/lib/authz";
import { resetSandbox } from "../src/lib/sandbox";
import { approveVersion, getRoleView } from "../src/lib/handover/service";
import { templateWriter } from "../src/lib/handover/compile";

async function build() {
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "").hostname)) throw new Error("Use a local fixture database.");
  const project = await resetSandbox("finished-demo-fixture");
  const note = "Open conflicts and unanswered questions are retained in the successor’s first-week plan.";
  await approveVersion(PERSONAS.rao, project.id, { override: true, note }, {writer:templateWriter});
  const {version,view} = await getRoleView(PERSONAS.arjun,project.id);
  if (!view || !version || view.compiled.canary.hits) throw new Error("No approved successor view.");
  const sections = view.compiled.sections.map(s => ({section:s.section,items:s.items.map(f=>({
    id:f.id.split("~")[0],title:f.title,statement:f.statement,
    evidence:f.evidence.filter(e=>e.relation==="SUPPORTS").map(({sourceTitle,locator,quote,relation})=>({sourceTitle,locator,quote,relation})),
  }))}));
  const output = { version:version.number, reviewer:version.approvedBy, successor:PERSONAS.arjun.name, note,
    plan7:view.compiled.plan7.map(p=>p.text), plan30:view.compiled.plan30.map(p=>p.text), sections };
  await writeFile("seed/finished-handover.json", JSON.stringify(output,null,2)+"\n");
}
build().finally(()=>prisma.$disconnect()).catch(e=>{console.error(e);process.exitCode=1;});

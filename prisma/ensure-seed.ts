import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { festflowCounts, resetFestflow, seedFestflow } from "../src/lib/seed/festflow";

// Runs at boot. Seeds only when the database has no projects yet; also repairs a
// FestFlow row that exists without data (e.g. the Phase 0 placeholder).
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const projects = await prisma.project.count();
    if (projects === 0) {
      console.log("ensure-seed: empty database, seeding FestFlow");
      await seedFestflow(prisma);
    } else {
      const ff = await prisma.project.findUnique({
        where: { slug: "festflow" },
        select: { _count: { select: { claims: true } } },
      });
      if (ff && ff._count.claims === 0) {
        console.log("ensure-seed: FestFlow has no data, reloading");
        await resetFestflow(prisma);
      } else {
        console.log("ensure-seed: data present, skipping");
        return;
      }
    }
    console.log("ensure-seed:", JSON.stringify(await festflowCounts(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // Never block boot on seeding trouble; the app and /api/health still come up.
  console.error("ensure-seed failed:", e);
});

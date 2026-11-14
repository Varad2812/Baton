import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { festflowCounts, seedFestflow } from "../src/lib/seed/festflow";

// Loads FestFlow (fixtures + seed/pipeline-cache.json). Idempotent: skips if present.
// Pass --reset to wipe and reload FestFlow only.
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    if (process.argv.includes("--reset")) {
      const { resetFestflow } = await import("../src/lib/seed/festflow");
      await resetFestflow(prisma);
      console.log("seed: FestFlow reset");
    } else {
      const inserted = await seedFestflow(prisma);
      console.log(inserted ? "seed: FestFlow inserted" : "seed: FestFlow already present, skipped");
    }
    console.log(JSON.stringify(await festflowCounts(prisma), null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

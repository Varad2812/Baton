import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Runs at start: seeds only if the database has no projects yet.
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  let empty = false;
  try {
    empty = (await prisma.project.count()) === 0;
  } finally {
    await prisma.$disconnect();
  }
  if (!empty) {
    console.log("ensure-seed: data present, skipping");
    return;
  }
  console.log("ensure-seed: empty database, seeding");
  const r = spawnSync("npm", ["run", "db:seed"], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

main().catch((e) => {
  // Never block boot on seeding trouble; the app and /api/health still come up.
  console.error("ensure-seed failed:", e);
});

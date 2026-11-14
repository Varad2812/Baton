import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// Placeholder seed: only the FestFlow project row. Fixtures + pipeline cache land in the data milestone.
export async function seed(prisma: PrismaClient) {
  await prisma.project.upsert({
    where: { slug: "festflow" },
    update: {},
    create: {
      slug: "festflow",
      name: "FestFlow",
      description:
        "Registration and ticketing web app of a college cultural-fest club.",
    },
  });
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    await seed(prisma);
    console.log("seed: done");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

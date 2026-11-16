-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('TEMPLATE', 'SANDBOX', 'STANDARD');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "idSuffix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" "ProjectKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "template" TEXT NOT NULL DEFAULT 'club',
ADD COLUMN     "templateSlug" TEXT,
ADD COLUMN     "visitorId" TEXT;

-- CreateIndex
CREATE INDEX "Project_visitorId_idx" ON "Project"("visitorId");

-- CreateIndex
CREATE INDEX "Project_expiresAt_idx" ON "Project"("expiresAt");

-- The demo project becomes the pristine template visitors are cloned from.
UPDATE "Project" SET "kind" = 'TEMPLATE' WHERE "slug" = 'festflow';

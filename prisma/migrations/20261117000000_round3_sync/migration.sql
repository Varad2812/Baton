-- AlterTable
ALTER TABLE "Chunk" ADD COLUMN     "meta" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "lastSyncedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncState_provider_externalKey_idx" ON "SyncState"("provider", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_projectId_provider_externalKey_key" ON "SyncState"("projectId", "provider", "externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "Source_projectId_externalId_key" ON "Source"("projectId", "externalId");

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One pipeline/sync run per project at a time (stale RUNNING rows are failed by the app after 5 min).
UPDATE "PipelineRun" SET "status" = 'FAILED', "finishedAt" = NOW(), "error" = 'Interrupted (server restarted)' WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "PipelineRun_one_running_per_project" ON "PipelineRun"("projectId") WHERE "status" = 'RUNNING';

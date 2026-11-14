-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('GITHUB_COMMIT', 'GITHUB_PR', 'GITHUB_ISSUE', 'DOC', 'CHAT', 'TASKS', 'TESTIMONY');

-- CreateEnum
CREATE TYPE "Access" AS ENUM ('PUBLIC', 'TEAM', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "RedactionKind" AS ENUM ('SECRET', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('DECISION', 'TASK', 'RISK', 'DEPENDENCY', 'CONTACT', 'QUESTION', 'RECURRING');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('VERIFIED', 'SINGLE_SOURCE', 'INFERRED', 'CONFLICTING', 'MISSING');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'EDITED', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "EvidenceRelation" AS ENUM ('SUPPORTS', 'CONTRADICTS');

-- CreateEnum
CREATE TYPE "ConflictKind" AS ENUM ('CONTRADICTS', 'SUPERSEDES');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Resolution" AS ENUM ('A', 'B', 'BOTH', 'ASKED');

-- CreateEnum
CREATE TYPE "GapKind" AS ENUM ('MISSING', 'CONFLICT', 'INFERRED', 'RECURRING', 'SINGLE_OWNER');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'REVIEWER', 'INCOMING', 'OBSERVER');

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('CACHED', 'LIVE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL DEFAULT '',
    "handles" TEXT[],
    "email" TEXT,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT,
    "access" "Access" NOT NULL DEFAULT 'TEAM',
    "authoritative" BOOLEAN NOT NULL DEFAULT false,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedToIncoming" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "author" TEXT,
    "timestamp" TIMESTAMP(3),
    "access" "Access" NOT NULL,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redaction" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "kind" "RedactionKind" NOT NULL,
    "placeholder" TEXT NOT NULL,
    "mentionedBy" TEXT,

    CONSTRAINT "Redaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ClaimType" NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "ownerPersonId" TEXT,
    "date" TIMESTAMP(3),
    "grade" "Grade" NOT NULL,
    "gradeReason" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "access" "Access" NOT NULL DEFAULT 'TEAM',
    "fromTestimony" BOOLEAN NOT NULL DEFAULT false,
    "reviewerNote" TEXT,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "relation" "EvidenceRelation" NOT NULL DEFAULT 'SUPPORTS',
    "quoteValid" BOOLEAN NOT NULL DEFAULT false,
    "matchStart" INTEGER,
    "matchEnd" INTEGER,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conflict" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "claimAId" TEXT NOT NULL,
    "claimBId" TEXT NOT NULL,
    "kind" "ConflictKind" NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "Resolution",
    "note" TEXT,

    CONSTRAINT "Conflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapQuestion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "GapKind" NOT NULL,
    "question" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "relatedClaimId" TEXT,
    "checklistKey" TEXT,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "testimonySourceId" TEXT,

    CONSTRAINT "GapQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "reviewerPersonId" TEXT NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverVersion" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "HandoverVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleView" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "compiled" JSONB NOT NULL,
    "hiddenCount" INTEGER NOT NULL DEFAULT 0,
    "sourceChunkIds" TEXT[],

    CONSTRAINT "RoleView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acknowledgement" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "claimId" TEXT,
    "section" TEXT,
    "question" TEXT NOT NULL,
    "askedById" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "mode" "RunMode" NOT NULL,
    "status" "RunStatus" NOT NULL,
    "stages" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCache" (
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_projectId_idx" ON "Person"("projectId");

-- CreateIndex
CREATE INDEX "Source_projectId_idx" ON "Source"("projectId");

-- CreateIndex
CREATE INDEX "Chunk_sourceId_idx" ON "Chunk"("sourceId");

-- CreateIndex
CREATE INDEX "Redaction_chunkId_idx" ON "Redaction"("chunkId");

-- CreateIndex
CREATE INDEX "Claim_projectId_idx" ON "Claim"("projectId");

-- CreateIndex
CREATE INDEX "Claim_projectId_topicKey_idx" ON "Claim"("projectId", "topicKey");

-- CreateIndex
CREATE INDEX "Claim_ownerPersonId_idx" ON "Claim"("ownerPersonId");

-- CreateIndex
CREATE INDEX "Evidence_claimId_idx" ON "Evidence"("claimId");

-- CreateIndex
CREATE INDEX "Evidence_chunkId_idx" ON "Evidence"("chunkId");

-- CreateIndex
CREATE INDEX "Conflict_projectId_idx" ON "Conflict"("projectId");

-- CreateIndex
CREATE INDEX "Conflict_claimAId_idx" ON "Conflict"("claimAId");

-- CreateIndex
CREATE INDEX "Conflict_claimBId_idx" ON "Conflict"("claimBId");

-- CreateIndex
CREATE INDEX "GapQuestion_projectId_idx" ON "GapQuestion"("projectId");

-- CreateIndex
CREATE INDEX "GapQuestion_relatedClaimId_idx" ON "GapQuestion"("relatedClaimId");

-- CreateIndex
CREATE INDEX "Handover_projectId_idx" ON "Handover"("projectId");

-- CreateIndex
CREATE INDEX "HandoverVersion_handoverId_idx" ON "HandoverVersion"("handoverId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverVersion_handoverId_number_key" ON "HandoverVersion"("handoverId", "number");

-- CreateIndex
CREATE INDEX "RoleView_versionId_idx" ON "RoleView"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleView_versionId_role_key" ON "RoleView"("versionId", "role");

-- CreateIndex
CREATE INDEX "Acknowledgement_versionId_idx" ON "Acknowledgement"("versionId");

-- CreateIndex
CREATE INDEX "Acknowledgement_personId_idx" ON "Acknowledgement"("personId");

-- CreateIndex
CREATE INDEX "FollowUp_handoverId_idx" ON "FollowUp"("handoverId");

-- CreateIndex
CREATE INDEX "FollowUp_claimId_idx" ON "FollowUp"("claimId");

-- CreateIndex
CREATE INDEX "PipelineRun_projectId_idx" ON "PipelineRun"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_idx" ON "AuditLog"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_at_idx" ON "AuditLog"("projectId", "at");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redaction" ADD CONSTRAINT "Redaction_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_claimAId_fkey" FOREIGN KEY ("claimAId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conflict" ADD CONSTRAINT "Conflict_claimBId_fkey" FOREIGN KEY ("claimBId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapQuestion" ADD CONSTRAINT "GapQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapQuestion" ADD CONSTRAINT "GapQuestion_relatedClaimId_fkey" FOREIGN KEY ("relatedClaimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapQuestion" ADD CONSTRAINT "GapQuestion_testimonySourceId_fkey" FOREIGN KEY ("testimonySourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_reviewerPersonId_fkey" FOREIGN KEY ("reviewerPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverVersion" ADD CONSTRAINT "HandoverVersion_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverVersion" ADD CONSTRAINT "HandoverVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleView" ADD CONSTRAINT "RoleView_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "HandoverVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgement" ADD CONSTRAINT "Acknowledgement_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "HandoverVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acknowledgement" ADD CONSTRAINT "Acknowledgement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Project" ADD COLUMN "teamMode" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TeamInvite" (
  "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "role" "Role" NOT NULL CHECK ("role" IN ('REVIEWER','INCOMING')),
  "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), "visitorId" TEXT
);
CREATE INDEX "TeamInvite_projectId_idx" ON "TeamInvite"("projectId");

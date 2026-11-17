-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "projectId" TEXT,
    "provider" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "teamUrl" TEXT,
    "tokenEnc" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '',
    "botUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connection_provider_teamId_idx" ON "Connection"("provider", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_visitorId_provider_teamId_key" ON "Connection"("visitorId", "provider", "teamId");


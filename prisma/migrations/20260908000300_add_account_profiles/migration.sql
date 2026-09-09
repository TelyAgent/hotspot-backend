-- CreateTable
CREATE TABLE "account_profiles" (
    "handle" TEXT NOT NULL,
    "displayHandle" TEXT,
    "displayName" TEXT,
    "twitterUserId" TEXT,
    "followers" INTEGER,
    "region" TEXT,
    "regionSource" TEXT,
    "bio" TEXT,
    "accountType" TEXT,
    "accountTypeSource" TEXT,
    "monitorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "groupTag" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'discovered',
    "weeklyPosts" INTEGER NOT NULL DEFAULT 0,
    "avgComments" DOUBLE PRECISION,
    "avgReposts" DOUBLE PRECISION,
    "avgViews" DOUBLE PRECISION,
    "avgLikes" DOUBLE PRECISION,
    "lastActiveAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastAggregatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_profiles_pkey" PRIMARY KEY ("handle")
);

-- CreateTable
CREATE TABLE "account_profile_tombstones" (
    "handle" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_profile_tombstones_pkey" PRIMARY KEY ("handle")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_profiles_twitterUserId_key" ON "account_profiles"("twitterUserId");
CREATE INDEX "account_profiles_monitorEnabled_idx" ON "account_profiles"("monitorEnabled");
CREATE INDEX "account_profiles_isActive_lastFetchedAt_idx" ON "account_profiles"("isActive", "lastFetchedAt");

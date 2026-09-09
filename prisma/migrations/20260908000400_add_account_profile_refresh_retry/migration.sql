-- 给 AccountProfile 补静态资料刷新的退避字段
ALTER TABLE "account_profiles"
  ADD COLUMN "refreshAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE INDEX "account_profiles_isActive_nextRetryAt_idx"
  ON "account_profiles" ("isActive", "nextRetryAt");

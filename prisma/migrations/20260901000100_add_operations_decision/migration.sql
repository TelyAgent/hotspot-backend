CREATE TABLE "predx_news_items" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "eventId" TEXT,
  "factId" TEXT,
  "title" TEXT NOT NULL,
  "newsTitle" TEXT,
  "sourceName" TEXT,
  "sourceUrl" TEXT,
  "category" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "latestAt" TIMESTAMP(3),
  "primaryMarketTitle" TEXT,
  "primaryMarketUrl" TEXT,
  "primaryMarketConfidence" DOUBLE PRECISION,
  "associatedMarketDisplayScore" DOUBLE PRECISION,
  "relatedMarkets" JSONB NOT NULL,
  "raw" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "predx_news_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operation_context_inbox_items" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "rawContent" TEXT NOT NULL,
  "summary" TEXT,
  "quality" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "conclusion" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operation_context_inbox_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operation_recommendations" (
  "id" TEXT NOT NULL,
  "sourceEventId" TEXT,
  "predxNewsItemId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendationLabels" JSONB NOT NULL,
  "basis" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "productAssociationStatus" TEXT NOT NULL,
  "productAssociationLevel" TEXT NOT NULL,
  "productAssociationRationale" TEXT NOT NULL,
  "selectedProductValue" TEXT,
  "recommendedProductPage" TEXT,
  "recommendedProductUrl" TEXT,
  "urlReason" TEXT,
  "evidenceRefs" JSONB NOT NULL,
  "riskNotes" JSONB NOT NULL,
  "missingData" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "agentRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operation_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operation_recommendation_angles" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "claim" TEXT NOT NULL,
  "targetUser" TEXT,
  "userValue" TEXT,
  "evidence" JSONB NOT NULL,
  "productUrl" TEXT,
  "riskNotes" JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operation_recommendation_angles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "predx_news_items_externalId_key" ON "predx_news_items"("externalId");
CREATE INDEX "predx_news_items_publishedAt_idx" ON "predx_news_items"("publishedAt");
CREATE INDEX "predx_news_items_category_idx" ON "predx_news_items"("category");
CREATE INDEX "operation_context_inbox_items_status_createdAt_idx" ON "operation_context_inbox_items"("status", "createdAt");
CREATE INDEX "operation_recommendations_status_createdAt_idx" ON "operation_recommendations"("status", "createdAt");
CREATE INDEX "operation_recommendations_sourceEventId_idx" ON "operation_recommendations"("sourceEventId");
CREATE INDEX "operation_recommendations_predxNewsItemId_idx" ON "operation_recommendations"("predxNewsItemId");
CREATE INDEX "operation_recommendation_angles_recommendationId_sortOrder_idx" ON "operation_recommendation_angles"("recommendationId", "sortOrder");

ALTER TABLE "operation_recommendations"
  ADD CONSTRAINT "operation_recommendations_predxNewsItemId_fkey"
  FOREIGN KEY ("predxNewsItemId") REFERENCES "predx_news_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_recommendation_angles"
  ADD CONSTRAINT "operation_recommendation_angles_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "operation_recommendations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "raw_items" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "observedAtBucket" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "rawItemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "platform" TEXT,
    "signalType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "rawRefs" JSONB NOT NULL,
    "metrics" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_video_analyses" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transcriptStatus" TEXT,
    "transcriptProvider" TEXT,
    "transcriptLanguage" TEXT,
    "transcriptText" TEXT,
    "transcriptSegments" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_video_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "signalId" TEXT,
    "sourceTool" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "claim" TEXT NOT NULL,
    "text" TEXT,
    "url" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB,
    "confidence" TEXT NOT NULL,
    "rawRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_runs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "rawItemCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "input" JSONB,
    "outputSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x_trend_snapshots" (
    "id" TEXT NOT NULL,
    "collectionRunId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "x_trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x_trend_snapshot_items" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "url" TEXT,
    "heat" TEXT,
    "category" TEXT,
    "raw" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x_trend_snapshot_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x_trend_snapshot_diffs" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "previousSnapshotId" TEXT,
    "region" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "previousRank" INTEGER,
    "currentRank" INTEGER,
    "rankDelta" INTEGER,
    "diffType" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x_trend_snapshot_diffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_configs" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_configs_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "goal" JSONB NOT NULL,
    "result" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_steps" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_run_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_calls" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "toolName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_proposed_actions" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_proposed_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionId" TEXT,
    "tool" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_rule_packs" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "basePath" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "description" TEXT,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_rule_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_mining_signal_runs" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "rulePackId" TEXT,
    "status" TEXT NOT NULL,
    "decision" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_mining_signal_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "future_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "domains" JSONB NOT NULL,
    "summary" TEXT,
    "whyItMatters" TEXT,
    "status" TEXT NOT NULL,
    "createdFrom" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "future_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "future_event_candidates" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "timeRange" JSONB,
    "domains" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "recommendedMonitoringStartAt" TIMESTAMP(3),
    "recommendedMonitoringEndAt" TIMESTAMP(3),
    "suggestedKeywords" JSONB NOT NULL,
    "suggestedAccounts" JSONB NOT NULL,
    "suggestedPlatforms" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "missingData" JSONB,
    "riskNotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "future_event_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "future_event_source_plans" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "strategyMarkdown" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "missingSources" JSONB,
    "refreshPolicy" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "future_event_source_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "future_event_monitoring_plans" (
    "id" TEXT NOT NULL,
    "futureEventId" TEXT NOT NULL,
    "monitoringStartAt" TIMESTAMP(3) NOT NULL,
    "monitoringEndAt" TIMESTAMP(3) NOT NULL,
    "phases" JSONB NOT NULL,
    "triggerRules" JSONB NOT NULL,
    "expectedContentAngles" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "missingData" JSONB,
    "riskNotes" JSONB,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "future_event_monitoring_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "future_event_monitoring_runs" (
    "id" TEXT NOT NULL,
    "futureEventId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "rawItemCount" INTEGER NOT NULL DEFAULT 0,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "input" JSONB,
    "outputSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "future_event_monitoring_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_watches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "domains" JSONB NOT NULL,
    "watchIntent" TEXT NOT NULL,
    "collectionPolicy" TEXT NOT NULL,
    "triggerPolicy" TEXT NOT NULL,
    "evidencePolicy" TEXT NOT NULL,
    "exclusionPolicy" TEXT,
    "status" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_watch_accounts" (
    "id" TEXT NOT NULL,
    "topicWatchId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "primaryRole" TEXT NOT NULL,
    "singleTriggerPolicy" TEXT NOT NULL,
    "authorityScope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_watch_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_monitoring_plans" (
    "id" TEXT NOT NULL,
    "topicWatchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "triggerRules" JSONB NOT NULL,
    "evidenceRequirements" JSONB NOT NULL,
    "refreshPolicy" JSONB NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_monitoring_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_candidates" (
    "id" TEXT NOT NULL,
    "topicWatchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "entities" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "signalCount" INTEGER NOT NULL,
    "postCount" INTEGER,
    "accountCount" INTEGER,
    "sourceTypes" JSONB NOT NULL,
    "representativeSignalIds" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "clustering" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_aggregation_runs" (
    "id" TEXT NOT NULL,
    "topicWatchId" TEXT NOT NULL,
    "monitoringRunId" TEXT,
    "windowStartAt" TIMESTAMP(3) NOT NULL,
    "windowEndAt" TIMESTAMP(3) NOT NULL,
    "inputSignalCount" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "topic_aggregation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_watch_decisions" (
    "id" TEXT NOT NULL,
    "topicWatchId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT NOT NULL,
    "matchedRules" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "missingData" JSONB NOT NULL,
    "riskNotes" JSONB NOT NULL,
    "suggestedPlanChanges" JSONB,
    "confidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_watch_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyNow" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "productAngles" JSONB NOT NULL,
    "contentWindow" TEXT,
    "evidenceRefs" JSONB NOT NULL,
    "missingData" JSONB NOT NULL,
    "riskNotes" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "evidenceRefs" JSONB NOT NULL,
    "missingData" JSONB NOT NULL,
    "riskNotes" JSONB NOT NULL,
    "labels" JSONB,
    "canonicalEventId" TEXT,
    "contextVersion" INTEGER NOT NULL DEFAULT 1,
    "identity" JSONB,
    "sourceSummary" JSONB,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_source_contexts" (
    "id" TEXT NOT NULL,
    "mainEventId" TEXT,
    "sourceEventId" TEXT,
    "sourceType" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerRuleCode" TEXT,
    "ruleVersion" TEXT,
    "contextVersion" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "identity" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "signalRefs" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_source_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_merge_decisions" (
    "id" TEXT NOT NULL,
    "incomingContextId" TEXT NOT NULL,
    "candidateMainEventId" TEXT,
    "decision" TEXT NOT NULL,
    "mergeConfidence" DOUBLE PRECISION NOT NULL,
    "hardConflict" BOOLEAN NOT NULL DEFAULT false,
    "dimensionResults" JSONB NOT NULL,
    "conflictPoints" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "impact" JSONB NOT NULL,
    "agentRunId" TEXT,
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_merge_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_relations" (
    "id" TEXT NOT NULL,
    "fromEventId" TEXT NOT NULL,
    "toEventId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_runs" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "goal" JSONB NOT NULL,
    "decision" JSONB,
    "confidence" TEXT,
    "riskNotes" JSONB,
    "missingData" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_items" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountSource" TEXT NOT NULL,
    "sourceSystem" TEXT,
    "priority" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentGoal" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "duplicateRisk" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_tasks" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentGoal" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_drafts" (
    "id" TEXT NOT NULL,
    "contentTaskId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "generationInput" JSONB NOT NULL,
    "userInstruction" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_posts" (
    "id" TEXT NOT NULL,
    "contentTaskId" TEXT NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "firstTrackedAt" TIMESTAMP(3),
    "lastTrackedAt" TIMESTAMP(3),
    "trackingStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "published_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_metric_snapshots" (
    "id" TEXT NOT NULL,
    "publishedPostId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER,
    "replies" INTEGER,
    "reposts" INTEGER,
    "quotes" INTEGER,
    "views" INTEGER,
    "rawMetrics" JSONB,
    "isMissingData" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "raw_items_dedupeKey_key" ON "raw_items"("dedupeKey");

-- CreateIndex
CREATE INDEX "raw_items_source_sourceType_observedAtBucket_idx" ON "raw_items"("source", "sourceType", "observedAtBucket");

-- CreateIndex
CREATE INDEX "signals_source_signalType_observedAt_idx" ON "signals"("source", "signalType", "observedAt");

-- CreateIndex
CREATE INDEX "youtube_video_analyses_status_createdAt_idx" ON "youtube_video_analyses"("status", "createdAt");

-- CreateIndex
CREATE INDEX "youtube_video_analyses_videoId_idx" ON "youtube_video_analyses"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_video_analyses_signalId_key" ON "youtube_video_analyses"("signalId");

-- CreateIndex
CREATE INDEX "evidence_items_signalId_idx" ON "evidence_items"("signalId");

-- CreateIndex
CREATE INDEX "evidence_items_sourceType_observedAt_idx" ON "evidence_items"("sourceType", "observedAt");

-- CreateIndex
CREATE INDEX "collection_runs_jobId_startedAt_idx" ON "collection_runs"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "collection_runs_pluginId_capabilityId_startedAt_idx" ON "collection_runs"("pluginId", "capabilityId", "startedAt");

-- CreateIndex
CREATE INDEX "x_trend_snapshots_region_observedAt_idx" ON "x_trend_snapshots"("region", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "x_trend_snapshots_collectionRunId_region_key" ON "x_trend_snapshots"("collectionRunId", "region");

-- CreateIndex
CREATE INDEX "x_trend_snapshot_items_query_rank_idx" ON "x_trend_snapshot_items"("query", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "x_trend_snapshot_items_snapshotId_query_key" ON "x_trend_snapshot_items"("snapshotId", "query");

-- CreateIndex
CREATE INDEX "x_trend_snapshot_diffs_region_observedAt_idx" ON "x_trend_snapshot_diffs"("region", "observedAt");

-- CreateIndex
CREATE INDEX "x_trend_snapshot_diffs_query_observedAt_idx" ON "x_trend_snapshot_diffs"("query", "observedAt");

-- CreateIndex
CREATE INDEX "agent_runs_agentType_startedAt_idx" ON "agent_runs"("agentType", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_run_steps_runId_stepIndex_key" ON "agent_run_steps"("runId", "stepIndex");

-- CreateIndex
CREATE INDEX "agent_tool_calls_runId_startedAt_idx" ON "agent_tool_calls"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "agent_tool_calls_toolName_startedAt_idx" ON "agent_tool_calls"("toolName", "startedAt");

-- CreateIndex
CREATE INDEX "copilot_sessions_tenantId_userId_updatedAt_idx" ON "copilot_sessions"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "copilot_messages_sessionId_createdAt_idx" ON "copilot_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "copilot_proposed_actions_sessionId_status_createdAt_idx" ON "copilot_proposed_actions"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "copilot_proposed_actions_tool_createdAt_idx" ON "copilot_proposed_actions"("tool", "createdAt");

-- CreateIndex
CREATE INDEX "copilot_audit_logs_tenantId_userId_createdAt_idx" ON "copilot_audit_logs"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "copilot_audit_logs_tool_createdAt_idx" ON "copilot_audit_logs"("tool", "createdAt");

-- CreateIndex
CREATE INDEX "opportunity_rule_packs_status_version_idx" ON "opportunity_rule_packs"("status", "version");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_rule_packs_version_key" ON "opportunity_rule_packs"("version");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_mining_signal_runs_idempotencyKey_key" ON "opportunity_mining_signal_runs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "opportunity_mining_signal_runs_signalId_createdAt_idx" ON "opportunity_mining_signal_runs"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunity_mining_signal_runs_status_createdAt_idx" ON "opportunity_mining_signal_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "future_events_eventType_status_idx" ON "future_events"("eventType", "status");

-- CreateIndex
CREATE INDEX "future_events_scheduledAt_idx" ON "future_events"("scheduledAt");

-- CreateIndex
CREATE INDEX "future_event_candidates_eventType_status_idx" ON "future_event_candidates"("eventType", "status");

-- CreateIndex
CREATE INDEX "future_event_candidates_scheduledAt_idx" ON "future_event_candidates"("scheduledAt");

-- CreateIndex
CREATE INDEX "future_event_source_plans_status_version_idx" ON "future_event_source_plans"("status", "version");

-- CreateIndex
CREATE UNIQUE INDEX "future_event_source_plans_version_key" ON "future_event_source_plans"("version");

-- CreateIndex
CREATE INDEX "future_event_monitoring_plans_futureEventId_status_idx" ON "future_event_monitoring_plans"("futureEventId", "status");

-- CreateIndex
CREATE INDEX "future_event_monitoring_plans_monitoringStartAt_monitoringE_idx" ON "future_event_monitoring_plans"("monitoringStartAt", "monitoringEndAt");

-- CreateIndex
CREATE INDEX "future_event_monitoring_runs_futureEventId_startedAt_idx" ON "future_event_monitoring_runs"("futureEventId", "startedAt");

-- CreateIndex
CREATE INDEX "future_event_monitoring_runs_planId_phase_startedAt_idx" ON "future_event_monitoring_runs"("planId", "phase", "startedAt");

-- CreateIndex
CREATE INDEX "topic_watches_status_idx" ON "topic_watches"("status");

-- CreateIndex
CREATE INDEX "topic_watch_accounts_topicWatchId_status_idx" ON "topic_watch_accounts"("topicWatchId", "status");

-- CreateIndex
CREATE INDEX "topic_watch_accounts_singleTriggerPolicy_idx" ON "topic_watch_accounts"("singleTriggerPolicy");

-- CreateIndex
CREATE UNIQUE INDEX "topic_watch_accounts_topicWatchId_handle_key" ON "topic_watch_accounts"("topicWatchId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "topic_monitoring_plans_topicWatchId_version_key" ON "topic_monitoring_plans"("topicWatchId", "version");

-- CreateIndex
CREATE INDEX "topic_candidates_topicWatchId_status_idx" ON "topic_candidates"("topicWatchId", "status");

-- CreateIndex
CREATE INDEX "topic_candidates_firstSeenAt_lastSeenAt_idx" ON "topic_candidates"("firstSeenAt", "lastSeenAt");

-- CreateIndex
CREATE INDEX "topic_aggregation_runs_topicWatchId_windowStartAt_windowEnd_idx" ON "topic_aggregation_runs"("topicWatchId", "windowStartAt", "windowEndAt");

-- CreateIndex
CREATE INDEX "topic_watch_decisions_topicWatchId_createdAt_idx" ON "topic_watch_decisions"("topicWatchId", "createdAt");

-- CreateIndex
CREATE INDEX "opportunities_type_status_idx" ON "opportunities"("type", "status");

-- CreateIndex
CREATE INDEX "opportunities_createdAt_idx" ON "opportunities"("createdAt");

-- CreateIndex
CREATE INDEX "events_eventType_status_idx" ON "events"("eventType", "status");

-- CreateIndex
CREATE INDEX "events_occurredAt_idx" ON "events"("occurredAt");

-- CreateIndex
CREATE INDEX "events_canonicalEventId_idx" ON "events"("canonicalEventId");

-- CreateIndex
CREATE INDEX "event_source_contexts_mainEventId_sourceType_idx" ON "event_source_contexts"("mainEventId", "sourceType");

-- CreateIndex
CREATE INDEX "event_source_contexts_sourceType_triggeredAt_idx" ON "event_source_contexts"("sourceType", "triggeredAt");

-- CreateIndex
CREATE INDEX "event_merge_decisions_incomingContextId_idx" ON "event_merge_decisions"("incomingContextId");

-- CreateIndex
CREATE INDEX "event_merge_decisions_candidateMainEventId_decidedAt_idx" ON "event_merge_decisions"("candidateMainEventId", "decidedAt");

-- CreateIndex
CREATE INDEX "event_relations_fromEventId_idx" ON "event_relations"("fromEventId");

-- CreateIndex
CREATE INDEX "event_relations_toEventId_idx" ON "event_relations"("toEventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_relations_fromEventId_toEventId_relationType_key" ON "event_relations"("fromEventId", "toEventId", "relationType");

-- CreateIndex
CREATE INDEX "assignment_runs_targetType_targetId_idx" ON "assignment_runs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "assignment_items_targetType_targetId_idx" ON "assignment_items"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "assignment_items_accountId_status_idx" ON "assignment_items"("accountId", "status");

-- CreateIndex
CREATE INDEX "content_tasks_targetType_targetId_idx" ON "content_tasks"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "content_tasks_accountId_status_idx" ON "content_tasks"("accountId", "status");

-- CreateIndex
CREATE INDEX "content_drafts_contentTaskId_status_idx" ON "content_drafts"("contentTaskId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_drafts_contentTaskId_version_key" ON "content_drafts"("contentTaskId", "version");

-- CreateIndex
CREATE INDEX "published_posts_contentTaskId_idx" ON "published_posts"("contentTaskId");

-- CreateIndex
CREATE INDEX "published_posts_accountId_idx" ON "published_posts"("accountId");

-- CreateIndex
CREATE INDEX "published_posts_trackingStatus_publishedAt_idx" ON "published_posts"("trackingStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "post_metric_snapshots_publishedPostId_observedAt_idx" ON "post_metric_snapshots"("publishedPostId", "observedAt");

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_rawItemId_fkey" FOREIGN KEY ("rawItemId") REFERENCES "raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_video_analyses" ADD CONSTRAINT "youtube_video_analyses_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "x_trend_snapshots" ADD CONSTRAINT "x_trend_snapshots_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "collection_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "x_trend_snapshot_items" ADD CONSTRAINT "x_trend_snapshot_items_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "x_trend_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "x_trend_snapshot_diffs" ADD CONSTRAINT "x_trend_snapshot_diffs_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "x_trend_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "x_trend_snapshot_diffs" ADD CONSTRAINT "x_trend_snapshot_diffs_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "x_trend_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_proposed_actions" ADD CONSTRAINT "copilot_proposed_actions_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_proposed_actions" ADD CONSTRAINT "copilot_proposed_actions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_audit_logs" ADD CONSTRAINT "copilot_audit_logs_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "copilot_proposed_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_mining_signal_runs" ADD CONSTRAINT "opportunity_mining_signal_runs_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_mining_signal_runs" ADD CONSTRAINT "opportunity_mining_signal_runs_rulePackId_fkey" FOREIGN KEY ("rulePackId") REFERENCES "opportunity_rule_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "future_event_monitoring_plans" ADD CONSTRAINT "future_event_monitoring_plans_futureEventId_fkey" FOREIGN KEY ("futureEventId") REFERENCES "future_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "future_event_monitoring_runs" ADD CONSTRAINT "future_event_monitoring_runs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "future_event_monitoring_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_watch_accounts" ADD CONSTRAINT "topic_watch_accounts_topicWatchId_fkey" FOREIGN KEY ("topicWatchId") REFERENCES "topic_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_monitoring_plans" ADD CONSTRAINT "topic_monitoring_plans_topicWatchId_fkey" FOREIGN KEY ("topicWatchId") REFERENCES "topic_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_candidates" ADD CONSTRAINT "topic_candidates_topicWatchId_fkey" FOREIGN KEY ("topicWatchId") REFERENCES "topic_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_aggregation_runs" ADD CONSTRAINT "topic_aggregation_runs_topicWatchId_fkey" FOREIGN KEY ("topicWatchId") REFERENCES "topic_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_watch_decisions" ADD CONSTRAINT "topic_watch_decisions_topicWatchId_fkey" FOREIGN KEY ("topicWatchId") REFERENCES "topic_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_runId_fkey" FOREIGN KEY ("runId") REFERENCES "assignment_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_metric_snapshots" ADD CONSTRAINT "post_metric_snapshots_publishedPostId_fkey" FOREIGN KEY ("publishedPostId") REFERENCES "published_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


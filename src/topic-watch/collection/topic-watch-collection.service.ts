import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../common/types/json.type';
import { CollectionRunnerService } from '../../data-source/runner/collection-runner.service';
import { TopicWatchRepository } from '../topic-watch.repository';
import { TopicMonitoringPlan } from '../topic-watch.types';

export interface TopicWatchCollectionInput {
  topicWatchId?: string;
  observedAt?: Date;
}

export interface TopicWatchCollectionResult {
  topicWatchCount: number;
  sourceCount: number;
  rawItemCount: number;
  signalCount: number;
  evidenceCount: number;
  candidateCount: number;
  triggeredCount: number;
  runs: Array<{
    topicWatchId: string;
    handle: string;
    runId: string;
    status: string;
    rawItemCount: number;
    errorMessage?: string | null;
  }>;
}

interface XAccountSource {
  platform: 'x';
  sourceType: 'account';
  handle: string;
  includeReplies?: unknown;
  includeQuotes?: unknown;
  includeReposts?: unknown;
  maxPages?: unknown;
}

@Injectable()
export class TopicWatchCollectionService {
  constructor(
    private readonly topicWatchRepository: TopicWatchRepository,
    private readonly collectionRunner: CollectionRunnerService,
  ) {}

  async collect(
    input: TopicWatchCollectionInput = {},
  ): Promise<TopicWatchCollectionResult> {
    const observedAt = input.observedAt ?? new Date();
    const topicWatches = input.topicWatchId
      ? compact([await this.topicWatchRepository.findTopicWatchById(input.topicWatchId)])
          .filter((topicWatch) => topicWatch.status === 'active')
      : await this.topicWatchRepository.listActiveTopicWatches();
    const result: TopicWatchCollectionResult = {
      topicWatchCount: topicWatches.length,
      sourceCount: 0,
      rawItemCount: 0,
      signalCount: 0,
      evidenceCount: 0,
      candidateCount: 0,
      triggeredCount: 0,
      runs: [],
    };

    for (const topicWatch of topicWatches) {
      const plan = await this.topicWatchRepository.findActiveMonitoringPlan(
        topicWatch.id,
      );
      if (!plan) continue;

      const sources = extractXAccountSources(plan.sources);
      result.sourceCount += sources.length;
      const windowStartAt = resolveSince(plan, observedAt);

      for (const source of sources) {
        const run = await this.collectionRunner.run({
          id: `topic_watch_${topicWatch.id}_x_${source.handle}_${randomUUID()}`,
          pluginId: 'x-account-posts',
          capabilityId: 'x.account.posts',
          observedAt,
          params: {
            topicWatchId: topicWatch.id,
            monitoringPlanId: plan.id,
            monitoringPlanVersion: plan.version,
            handle: source.handle,
            since: windowStartAt.toISOString(),
            until: observedAt.toISOString(),
            maxPages: getNumber(source.maxPages, 5),
            includeReplies: getBoolean(source.includeReplies, true),
            includeQuotes: getBoolean(source.includeQuotes, true),
            includeReposts: getBoolean(source.includeReposts, false),
          },
        });

        const summary = isJsonObject(run.outputSummary)
          ? run.outputSummary
          : {};
        const signalCount = getNumber(summary.signalCount, 0);
        const evidenceCount = getNumber(summary.evidenceCount, 0);

        result.rawItemCount += run.rawItemCount;
        result.signalCount += signalCount;
        result.evidenceCount += evidenceCount;
        result.runs.push({
          topicWatchId: topicWatch.id,
          handle: source.handle,
          runId: run.id,
          status: run.status,
          rawItemCount: run.rawItemCount,
          errorMessage: run.errorMessage,
        });
      }
    }

    return result;
  }
}

function extractXAccountSources(sources: JsonObject[]): XAccountSource[] {
  const normalized: XAccountSource[] = [];

  for (const source of sources) {
    if (
      source.platform === 'x' &&
      source.sourceType === 'account' &&
      typeof source.handle === 'string' &&
      source.handle.trim().length > 0
    ) {
      normalized.push({
        platform: 'x',
        sourceType: 'account',
        handle: source.handle.trim(),
        includeReplies: source.includeReplies,
        includeQuotes: source.includeQuotes,
        includeReposts: source.includeReposts,
        maxPages: source.maxPages,
      });
    }
  }

  return normalized;
}

function resolveSince(plan: TopicMonitoringPlan, observedAt: Date) {
  const refreshPolicy = isJsonObject(plan.refreshPolicy)
    ? plan.refreshPolicy
    : {};
  const lookbackMinutes = getNumber(refreshPolicy.lookbackMinutes, 180);
  return new Date(observedAt.getTime() - lookbackMinutes * 60 * 1000);
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => Boolean(value));
}

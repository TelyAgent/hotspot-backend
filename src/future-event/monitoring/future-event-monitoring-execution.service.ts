import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { CollectionRunnerService } from '../../data-source/runner/collection-runner.service';
import { CollectionJobConfig } from '../../data-source/runner/collection-job.types';
import { FutureEventRepository } from '../future-event.repository';
import {
  FutureEventMonitoringPhase,
  FutureEventMonitoringPlan,
  FutureEventMonitoringSource,
} from '../future-event.types';

export interface FutureEventMonitoringExecutionResult {
  planCount: number;
  phaseCount: number;
  sourceCount: number;
  skippedSourceCount: number;
  collectionRunCount: number;
  rawItemCount: number;
  signalCount: number;
  runs: Array<{
    planId: string;
    phase: string;
    collectionRunId: string;
    status: string;
    rawItemCount: number;
    signalCount: number;
    errorMessage?: string | null;
  }>;
}

@Injectable()
export class FutureEventMonitoringExecutionService {
  constructor(
    private readonly futureEventRepository: FutureEventRepository,
    private readonly collectionRunner: CollectionRunnerService,
  ) {}

  async runDuePlans(input: {
    observedAt?: Date;
  } = {}): Promise<FutureEventMonitoringExecutionResult> {
    const observedAt = input.observedAt ?? new Date();
    const plans =
      await this.futureEventRepository.listActiveMonitoringPlansAt(observedAt);
    const result: FutureEventMonitoringExecutionResult = {
      planCount: plans.length,
      phaseCount: 0,
      sourceCount: 0,
      skippedSourceCount: 0,
      collectionRunCount: 0,
      rawItemCount: 0,
      signalCount: 0,
      runs: [],
    };

    for (const plan of plans) {
      const phases = getActivePhases(plan, observedAt);
      result.phaseCount += phases.length;

      for (const phase of phases) {
        const monitoringRun = await this.futureEventRepository.createMonitoringRun({
          futureEventId: plan.futureEventId,
          planId: plan.id,
          phase: phase.name,
          startedAt: observedAt,
          input: {
            phase: phase.name,
            phaseStartAt: phase.startAt,
            phaseEndAt: phase.endAt,
            sourceCount: phase.sources.length,
          },
        });

        const jobs = createCollectionJobs(plan, phase, observedAt);
        result.sourceCount += phase.sources.length;
        result.skippedSourceCount += phase.sources.length - jobs.length;

        let rawItemCount = 0;
        let signalCount = 0;
        const outputRuns: JsonObject[] = [];

        try {
          for (const job of jobs) {
            const run = await this.collectionRunner.run(job);
            const summary = isJsonObject(run.outputSummary) ? run.outputSummary : {};
            const currentSignalCount = getNumber(summary.signalCount, 0);

            rawItemCount += run.rawItemCount;
            signalCount += currentSignalCount;
            result.collectionRunCount += 1;
            result.runs.push({
              planId: plan.id,
              phase: phase.name,
              collectionRunId: run.id,
              status: run.status,
              rawItemCount: run.rawItemCount,
              signalCount: currentSignalCount,
              errorMessage: run.errorMessage,
            });
            outputRuns.push({
              collectionRunId: run.id,
              status: run.status,
              rawItemCount: run.rawItemCount,
              signalCount: currentSignalCount,
              errorMessage: run.errorMessage ?? null,
            });
          }

          result.rawItemCount += rawItemCount;
          result.signalCount += signalCount;
          await this.futureEventRepository.finishMonitoringRun({
            id: monitoringRun.id,
            status: jobs.length > 0 ? 'succeeded' : 'skipped',
            finishedAt: new Date(),
            rawItemCount,
            signalCount,
            outputSummary: {
              collectionRuns: outputRuns,
              skippedSourceCount: phase.sources.length - jobs.length,
            },
          });
        } catch (error) {
          await this.futureEventRepository.finishMonitoringRun({
            id: monitoringRun.id,
            status: 'failed',
            finishedAt: new Date(),
            rawItemCount,
            signalCount,
            errorMessage: error instanceof Error ? error.message : String(error),
            outputSummary: {
              collectionRuns: outputRuns,
              skippedSourceCount: phase.sources.length - jobs.length,
            },
          });
        }
      }
    }

    return result;
  }
}

function getActivePhases(
  plan: FutureEventMonitoringPlan,
  observedAt: Date,
): FutureEventMonitoringPhase[] {
  return plan.phases.filter((phase) => {
    const startAt = new Date(phase.startAt).getTime();
    const endAt = new Date(phase.endAt).getTime();
    const now = observedAt.getTime();
    return Number.isFinite(startAt) && Number.isFinite(endAt) && startAt <= now && endAt >= now;
  });
}

function createCollectionJobs(
  plan: FutureEventMonitoringPlan,
  phase: FutureEventMonitoringPhase,
  observedAt: Date,
): CollectionJobConfig[] {
  return phase.sources.flatMap((source) =>
    createCollectionJobsForSource(plan, phase, source, observedAt),
  );
}

function createCollectionJobsForSource(
  plan: FutureEventMonitoringPlan,
  phase: FutureEventMonitoringPhase,
  source: FutureEventMonitoringSource,
  observedAt: Date,
): CollectionJobConfig[] {
  if (source.sourceType === 'x_account') {
    return (source.accounts ?? []).map((handle) => ({
      id: `future_event_${plan.futureEventId}_${phase.name}_x_${handle}_${randomUUID()}`,
      pluginId: 'x-account-posts',
      capabilityId: 'x.account.posts',
      observedAt,
      params: baseParams(plan, phase, source, observedAt, {
        handle,
        since: resolveSince(source.frequency, observedAt).toISOString(),
        until: observedAt.toISOString(),
        maxPages: 3,
        includeReplies: true,
        includeQuotes: true,
        includeReposts: false,
      }),
    }));
  }

  if (source.sourceType === 'youtube_search' && source.query?.trim()) {
    return [
      {
        id: `future_event_${plan.futureEventId}_${phase.name}_youtube_${randomUUID()}`,
        pluginId: 'youtube-videos',
        capabilityId: 'youtube.videos.discover',
        observedAt,
        params: baseParams(plan, phase, source, observedAt, {
          keywords: [source.query.trim()],
          perKeywordLimit: 5,
          perCategoryLimit: 0,
        }),
      },
    ];
  }

  if (source.sourceType === 'x_trend') {
    return [
      {
        id: `future_event_${plan.futureEventId}_${phase.name}_x_trend_${randomUUID()}`,
        pluginId: 'x-trends',
        capabilityId: 'x.trends.list',
        observedAt,
        params: baseParams(plan, phase, source, observedAt, {
          regions: ['global'],
          limit: 30,
        }),
      },
    ];
  }

  return [];
}

function baseParams(
  plan: FutureEventMonitoringPlan,
  phase: FutureEventMonitoringPhase,
  source: FutureEventMonitoringSource,
  observedAt: Date,
  params: JsonObject,
): JsonObject {
  return {
    futureEventId: plan.futureEventId,
    monitoringPlanId: plan.id,
    phase: phase.name,
    sourceType: source.sourceType,
    reason: source.reason,
    observedAt: observedAt.toISOString(),
    ...params,
  };
}

function resolveSince(frequency: string, observedAt: Date) {
  const intervalMs = parseFrequencyMs(frequency) ?? 2 * 60 * 60 * 1000;
  return new Date(observedAt.getTime() - intervalMs);
}

function parseFrequencyMs(value: string) {
  const match = value.trim().match(/^(\d+)\s*(m|h|d)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2].toLowerCase();
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isJsonObject(value: JsonValue | undefined | null): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

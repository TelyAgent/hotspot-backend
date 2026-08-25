import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CollectionRunnerService } from '../../data-source/runner/collection-runner.service';
import { PrismaService } from '../../database/prisma.service';
import { FutureEventDiscoveryAgentService } from '../discovery/future-event-discovery-agent.service';
import {
  FutureEventSourcePlan,
  FutureEventSourcePlanSource,
} from '../future-event.types';

const DEFAULT_SOURCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FutureEventSourceService {
  constructor(
    private readonly collectionRunner: CollectionRunnerService,
    private readonly prisma: PrismaService,
    private readonly discoveryAgent: FutureEventDiscoveryAgentService,
  ) {}

  async collectActiveSourcePlan(observedAt = new Date()) {
    const plan = await this.findActiveSourcePlan();
    if (!plan) {
      return null;
    }

    const sources = normalizePlanSources(plan.sources);
    const runs = [];
    let rawItemCount = 0;
    let signalCount = 0;
    let candidateCount = 0;

    for (const source of sources) {
      const sourceId = source.id ?? createSourceId(source);
      const jobId = `future_source_plan_${plan.id}_${sourceId}`;
      const run = await this.collectionRunner.run({
        id: jobId,
        pluginId: source.pluginId,
        capabilityId: source.capabilityId,
        params: source.params,
        observedAt,
      });
      rawItemCount += run.rawItemCount;

      let sourceSignalCount = 0;
      let sourceCandidateCount = 0;
      if (run.status === 'succeeded') {
        const signals = await this.listCollectedSignalsByJobId(jobId, observedAt);
        sourceSignalCount = signals.length;
        signalCount += sourceSignalCount;

        const discovery = await this.discoveryAgent.discoverFromSignals({
          instruction:
            '从本次 Agent 来源计划采集到的 Signal 中发现值得运营关注的未来事件候选。不要直接创建正式 FutureEvent。',
          signals,
        });
        sourceCandidateCount = discovery.candidateCount;
        candidateCount += sourceCandidateCount;
      }

      runs.push({
        sourceId,
        pluginId: source.pluginId,
        capabilityId: source.capabilityId,
        runId: run.id,
        status: run.status,
        rawItemCount: run.rawItemCount,
        signalCount: sourceSignalCount,
        candidateCount: sourceCandidateCount,
        errorMessage: run.errorMessage,
      });
    }

    return {
      planId: plan.id,
      planVersion: plan.version,
      sourceCount: sources.length,
      rawItemCount,
      signalCount,
      candidateCount,
      runs,
    };
  }

  async findActiveSourcePlan() {
    return this.prisma.futureEventSourcePlan.findFirst({
      where: {
        status: 'active',
      },
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<FutureEventSourcePlan | null>;
  }

  async latestActiveSourcePlanRunStartedAt() {
    const plan = await this.findActiveSourcePlan();
    if (!plan) return null;

    const latestRun = await this.prisma.collectionRun.findFirst({
      where: {
        jobId: {
          startsWith: `future_source_plan_${plan.id}_`,
        },
        status: 'succeeded',
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    return latestRun?.startedAt ?? null;
  }

  async sourceStatus() {
    const activePlan = await this.findActiveSourcePlan();
    if (!activePlan) {
      return {
        mode: 'source_plan',
        status: 'pending',
        message: '尚未激活未来事件来源计划，请先根据 Markdown 策略生成并激活计划。',
        activePlan: null,
      };
    }

    const latestRun = await this.prisma.collectionRun.findFirst({
      where: {
        jobId: {
          startsWith: `future_source_plan_${activePlan.id}_`,
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    return {
      mode: 'source_plan',
      status: getSourceStatus(true, latestRun?.status),
      activePlan: {
        id: activePlan.id,
        version: activePlan.version,
        sourceCount: normalizePlanSources(activePlan.sources).length,
        reason: activePlan.reason,
      },
      lastSyncAt:
        latestRun?.status === 'succeeded'
          ? latestRun.finishedAt?.toISOString() ?? latestRun.startedAt.toISOString()
          : null,
      nextSyncAt:
        latestRun
          ? new Date(latestRun.startedAt.getTime() + getPlanIntervalMs(activePlan)).toISOString()
          : null,
      message: latestRun?.errorMessage ?? undefined,
    };
  }

  private async listCollectedSignalsByJobId(jobId: string, observedAt: Date) {
    return this.prisma.signal.findMany({
      where: {
        source: 'future-events',
        signalType: 'future_event',
        observedAt,
        metadata: {
          path: ['jobId'],
          equals: jobId,
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
      take: 500,
    });
  }
}

function getPlanIntervalMs(plan: FutureEventSourcePlan) {
  const value = plan.refreshPolicy.intervalMs;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SOURCE_INTERVAL_MS;
}

function normalizePlanSources(value: unknown): FutureEventSourcePlanSource[] {
  return Array.isArray(value)
    ? value.filter(isPlanSource)
    : [];
}

function isPlanSource(value: unknown): value is FutureEventSourcePlanSource {
  return Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as FutureEventSourcePlanSource).pluginId === 'string' &&
    typeof (value as FutureEventSourcePlanSource).capabilityId === 'string' &&
    Boolean((value as FutureEventSourcePlanSource).params) &&
    typeof (value as FutureEventSourcePlanSource).params === 'object' &&
    !Array.isArray((value as FutureEventSourcePlanSource).params);
}

function createSourceId(source: FutureEventSourcePlanSource) {
  return `${source.pluginId}_${source.capabilityId}_${randomUUID()}`
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
}


function getSourceStatus(
  enabled: boolean,
  latestRunStatus?: string,
): 'ok' | 'error' | 'disabled' | 'pending' {
  if (!enabled) return 'disabled';
  if (!latestRunStatus) return 'pending';
  return latestRunStatus === 'succeeded' ? 'ok' : 'error';
}

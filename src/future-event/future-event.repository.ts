import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateFutureEventCandidateInput,
  CreateFutureEventInput,
  CreateFutureEventMonitoringPlanInput,
  CreateFutureEventSourcePlanInput,
  FutureEvent,
  FutureEventCandidate,
  FutureEventMonitoringPlan,
  FutureEventMonitoringRun,
  FutureEventSourcePlan,
} from './future-event.types';

@Injectable()
export class FutureEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(input: CreateFutureEventInput): Promise<FutureEvent> {
    return this.prisma.futureEvent.create({
      data: {
        title: input.title,
        eventType: input.eventType,
        scheduledAt: input.scheduledAt ?? null,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        domains: input.domains,
        summary: input.summary ?? null,
        whyItMatters: input.whyItMatters ?? null,
        status: input.status ?? 'confirmed',
        createdFrom: input.createdFrom,
        confidence: input.confidence ?? 'medium',
        metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    }) as unknown as Promise<FutureEvent>;
  }

  async findEventById(id: string): Promise<FutureEvent | null> {
    return this.prisma.futureEvent.findUnique({
      where: { id },
    }) as unknown as Promise<FutureEvent | null>;
  }

  async listEvents(input: {
    status?: string;
    take?: number;
  } = {}): Promise<FutureEvent[]> {
    return this.prisma.futureEvent.findMany({
      where: input.status
        ? {
            status: input.status,
          }
        : undefined,
      take: input.take ?? 50,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<FutureEvent[]>;
  }

  async upsertCandidate(
    input: CreateFutureEventCandidateInput,
  ): Promise<FutureEventCandidate> {
    const id = createCandidateId(input);

    return this.prisma.futureEventCandidate.upsert({
      where: { id },
      update: {
        title: input.title,
        eventType: input.eventType,
        scheduledAt: input.scheduledAt ?? null,
        timeRange: (input.timeRange ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        domains: input.domains as unknown as Prisma.InputJsonValue,
        summary: input.summary,
        whyItMatters: input.whyItMatters,
        recommendedMonitoringStartAt: input.recommendedMonitoringStartAt ?? null,
        recommendedMonitoringEndAt: input.recommendedMonitoringEndAt ?? null,
        suggestedKeywords: input.suggestedKeywords as unknown as Prisma.InputJsonValue,
        suggestedAccounts: input.suggestedAccounts as unknown as Prisma.InputJsonValue,
        suggestedPlatforms: input.suggestedPlatforms as unknown as Prisma.InputJsonValue,
        evidenceRefs: input.evidenceRefs as unknown as Prisma.InputJsonValue,
        confidence: input.confidence,
        status: input.status ?? 'new',
        missingData: (input.missingData ?? []) as unknown as Prisma.InputJsonValue,
        riskNotes: (input.riskNotes ?? []) as unknown as Prisma.InputJsonValue,
      },
      create: {
        id,
        title: input.title,
        eventType: input.eventType,
        scheduledAt: input.scheduledAt ?? null,
        timeRange: (input.timeRange ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        domains: input.domains as unknown as Prisma.InputJsonValue,
        summary: input.summary,
        whyItMatters: input.whyItMatters,
        recommendedMonitoringStartAt: input.recommendedMonitoringStartAt ?? null,
        recommendedMonitoringEndAt: input.recommendedMonitoringEndAt ?? null,
        suggestedKeywords: input.suggestedKeywords as unknown as Prisma.InputJsonValue,
        suggestedAccounts: input.suggestedAccounts as unknown as Prisma.InputJsonValue,
        suggestedPlatforms: input.suggestedPlatforms as unknown as Prisma.InputJsonValue,
        evidenceRefs: input.evidenceRefs as unknown as Prisma.InputJsonValue,
        confidence: input.confidence,
        status: input.status ?? 'new',
        missingData: (input.missingData ?? []) as unknown as Prisma.InputJsonValue,
        riskNotes: (input.riskNotes ?? []) as unknown as Prisma.InputJsonValue,
      },
    }) as unknown as Promise<FutureEventCandidate>;
  }

  async listCandidates(input: {
    status?: string;
    take?: number;
  } = {}): Promise<FutureEventCandidate[]> {
    return this.prisma.futureEventCandidate.findMany({
      where: input.status ? { status: input.status } : undefined,
      take: input.take ?? 50,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<FutureEventCandidate[]>;
  }

  async findCandidateById(id: string): Promise<FutureEventCandidate | null> {
    return this.prisma.futureEventCandidate.findUnique({
      where: { id },
    }) as unknown as Promise<FutureEventCandidate | null>;
  }

  async updateCandidateStatus(input: {
    id: string;
    status: 'new' | 'confirmed' | 'ignored';
  }): Promise<FutureEventCandidate> {
    return this.prisma.futureEventCandidate.update({
      where: { id: input.id },
      data: { status: input.status },
    }) as unknown as Promise<FutureEventCandidate>;
  }

  async findLatestSourcePlan(): Promise<FutureEventSourcePlan | null> {
    return this.prisma.futureEventSourcePlan.findFirst({
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<FutureEventSourcePlan | null>;
  }

  async findActiveSourcePlan(): Promise<FutureEventSourcePlan | null> {
    return this.prisma.futureEventSourcePlan.findFirst({
      where: {
        status: 'active',
      },
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<FutureEventSourcePlan | null>;
  }

  async listSourcePlans(input: { take?: number } = {}): Promise<FutureEventSourcePlan[]> {
    return this.prisma.futureEventSourcePlan.findMany({
      take: input.take ?? 20,
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<FutureEventSourcePlan[]>;
  }

  async createSourcePlan(
    input: CreateFutureEventSourcePlanInput,
  ): Promise<FutureEventSourcePlan> {
    return this.prisma.futureEventSourcePlan.create({
      data: {
        version: input.version,
        status: input.status ?? 'draft',
        strategyMarkdown: input.strategyMarkdown,
        sources: input.sources as unknown as Prisma.InputJsonValue,
        missingSources:
          (input.missingSources ?? []) as unknown as Prisma.InputJsonValue,
        refreshPolicy: input.refreshPolicy as Prisma.InputJsonValue,
        reason: input.reason,
        generatedBy: input.generatedBy,
        agentRunId: input.agentRunId ?? null,
      },
    }) as unknown as Promise<FutureEventSourcePlan>;
  }

  async activateSourcePlan(id: string): Promise<FutureEventSourcePlan> {
    return this.prisma.$transaction(async (tx) => {
      await tx.futureEventSourcePlan.updateMany({
        where: {
          status: 'active',
          id: {
            not: id,
          },
        },
        data: {
          status: 'paused',
        },
      });

      return tx.futureEventSourcePlan.update({
        where: { id },
        data: { status: 'active' },
      });
    }) as unknown as Promise<FutureEventSourcePlan>;
  }

  async createMonitoringPlan(
    input: CreateFutureEventMonitoringPlanInput,
  ): Promise<FutureEventMonitoringPlan> {
    return this.prisma.futureEventMonitoringPlan.create({
      data: {
        futureEvent: {
          connect: {
            id: input.futureEventId,
          },
        },
        monitoringStartAt: input.monitoringStartAt,
        monitoringEndAt: input.monitoringEndAt,
        phases: input.phases as unknown as Prisma.InputJsonValue,
        triggerRules: input.triggerRules as unknown as Prisma.InputJsonValue,
        expectedContentAngles:
          input.expectedContentAngles as unknown as Prisma.InputJsonValue,
        evidenceRefs: input.evidenceRefs as unknown as Prisma.InputJsonValue,
        confidence: input.confidence,
        missingData: (input.missingData ?? []) as unknown as Prisma.InputJsonValue,
        riskNotes: (input.riskNotes ?? []) as unknown as Prisma.InputJsonValue,
        status: input.status ?? 'draft',
      },
    }) as unknown as Promise<FutureEventMonitoringPlan>;
  }

  async listMonitoringPlans(
    futureEventId: string,
  ): Promise<FutureEventMonitoringPlan[]> {
    return this.prisma.futureEventMonitoringPlan.findMany({
      where: {
        futureEventId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<FutureEventMonitoringPlan[]>;
  }

  async updateMonitoringPlanStatus(input: {
    id: string;
    status: 'draft' | 'active' | 'paused' | 'archived';
  }): Promise<FutureEventMonitoringPlan> {
    return this.prisma.futureEventMonitoringPlan.update({
      where: { id: input.id },
      data: { status: input.status },
    }) as unknown as Promise<FutureEventMonitoringPlan>;
  }

  async listActiveMonitoringPlansAt(
    observedAt: Date,
  ): Promise<FutureEventMonitoringPlan[]> {
    return this.prisma.futureEventMonitoringPlan.findMany({
      where: {
        status: 'active',
        monitoringStartAt: {
          lte: observedAt,
        },
        monitoringEndAt: {
          gte: observedAt,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<FutureEventMonitoringPlan[]>;
  }

  async createMonitoringRun(input: {
    futureEventId: string;
    planId: string;
    phase: string;
    startedAt: Date;
    input?: Prisma.InputJsonValue;
  }): Promise<FutureEventMonitoringRun> {
    return this.prisma.futureEventMonitoringRun.create({
      data: {
        futureEventId: input.futureEventId,
        planId: input.planId,
        phase: input.phase,
        status: 'running',
        startedAt: input.startedAt,
        input: input.input ?? Prisma.JsonNull,
      },
    }) as unknown as Promise<FutureEventMonitoringRun>;
  }

  async finishMonitoringRun(input: {
    id: string;
    status: 'succeeded' | 'failed' | 'skipped';
    finishedAt: Date;
    rawItemCount?: number;
    signalCount?: number;
    errorMessage?: string | null;
    outputSummary?: Prisma.InputJsonValue;
  }): Promise<FutureEventMonitoringRun> {
    return this.prisma.futureEventMonitoringRun.update({
      where: { id: input.id },
      data: {
        status: input.status,
        finishedAt: input.finishedAt,
        rawItemCount: input.rawItemCount ?? 0,
        signalCount: input.signalCount ?? 0,
        errorMessage: input.errorMessage ?? null,
        outputSummary: input.outputSummary ?? Prisma.JsonNull,
      },
    }) as unknown as Promise<FutureEventMonitoringRun>;
  }
}

function createCandidateId(input: CreateFutureEventCandidateInput) {
  const scheduledAt = input.scheduledAt?.toISOString() ?? 'unknown';
  const key = `${input.eventType}:${input.title}:${scheduledAt}`;
  return `fec_${Buffer.from(key).toString('base64url').slice(0, 48)}`;
}

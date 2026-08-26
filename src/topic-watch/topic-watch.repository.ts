import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JsonObject } from '../common/types/json.type';
import { PrismaService } from '../database/prisma.service';
import { Signal } from '../signal/signal/signal.types';
import {
  CreateTopicCandidateInput,
  CreateTopicWatchDecisionInput,
  CreateTopicWatchInput,
  TopicCandidate,
  TopicWatch,
  TopicWatchAccount,
  TopicWatchDecision,
  TopicMonitoringPlan,
  UpdateTopicWatchAccountInput,
} from './topic-watch.types';

export interface UpdateTopicWatchInput {
  name?: string;
  description?: string;
  domains?: string[];
  watchIntent?: string;
  collectionPolicy?: string;
  triggerPolicy?: string;
  evidencePolicy?: string;
  exclusionPolicy?: string | null;
  status?: string;
}

export interface UpdateMonitoringPlanInput {
  sources?: JsonObject[];
  triggerRules?: JsonObject[];
  evidenceRequirements?: JsonObject[];
  refreshPolicy?: JsonObject;
  reason?: string;
  status?: string;
}

@Injectable()
export class TopicWatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createTopicWatch(input: CreateTopicWatchInput): Promise<TopicWatch> {
    return this.prisma.topicWatch.create({
      data: {
        name: input.name,
        description: input.description,
        domains: input.domains,
        watchIntent: input.watchIntent,
        collectionPolicy: input.collectionPolicy,
        triggerPolicy: input.triggerPolicy,
        evidencePolicy: input.evidencePolicy,
        exclusionPolicy: input.exclusionPolicy ?? null,
        status: input.status ?? 'active',
        ownerId: input.ownerId ?? null,
      },
    }) as unknown as Promise<TopicWatch>;
  }

  async findTopicWatchById(id: string): Promise<TopicWatch | null> {
    return this.prisma.topicWatch.findUnique({
      where: { id },
      include: {
        accounts: {
          where: {
            status: 'active',
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        monitoringPlans: {
          where: {
            status: 'active',
          },
          orderBy: {
            version: 'desc',
          },
          take: 1,
        },
      },
    }) as unknown as Promise<TopicWatch | null>;
  }

  async updateTopicWatch(
    id: string,
    input: UpdateTopicWatchInput,
  ): Promise<TopicWatch> {
    return this.prisma.topicWatch.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.domains !== undefined ? { domains: input.domains } : {}),
        ...(input.watchIntent !== undefined
          ? { watchIntent: input.watchIntent }
          : {}),
        ...(input.collectionPolicy !== undefined
          ? { collectionPolicy: input.collectionPolicy }
          : {}),
        ...(input.triggerPolicy !== undefined
          ? { triggerPolicy: input.triggerPolicy }
          : {}),
        ...(input.evidencePolicy !== undefined
          ? { evidencePolicy: input.evidencePolicy }
          : {}),
        ...(input.exclusionPolicy !== undefined
          ? { exclusionPolicy: input.exclusionPolicy }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    }) as unknown as Promise<TopicWatch>;
  }

  async listTopicWatches(): Promise<TopicWatch[]> {
    return this.prisma.topicWatch.findMany({
      include: {
        accounts: {
          where: {
            status: 'active',
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        monitoringPlans: {
          where: {
            status: 'active',
          },
          orderBy: {
            version: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<TopicWatch[]>;
  }

  async listActiveTopicWatches(): Promise<TopicWatch[]> {
    return this.prisma.topicWatch.findMany({
      where: {
        status: 'active',
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<TopicWatch[]>;
  }

  async updateTopicWatchAccounts(
    topicWatchId: string,
    accounts: UpdateTopicWatchAccountInput[],
  ): Promise<TopicWatchAccount[]> {
    const activeHandles = accounts.map((account) => normalizeHandle(account.handle));

    await this.prisma.topicWatchAccount.updateMany({
      where: {
        topicWatchId,
        handle: {
          notIn: activeHandles,
        },
      },
      data: {
        status: 'archived',
      },
    });

    for (const account of accounts) {
      await this.prisma.topicWatchAccount.upsert({
        where: {
          topicWatchId_handle: {
            topicWatchId,
            handle: normalizeHandle(account.handle),
          },
        },
        update: {
          primaryRole: account.primaryRole,
          singleTriggerPolicy: account.singleTriggerPolicy,
          authorityScope: account.authorityScope,
          sortOrder: account.sortOrder,
          status: account.status ?? 'active',
        },
        create: {
          topicWatchId,
          handle: normalizeHandle(account.handle),
          primaryRole: account.primaryRole,
          singleTriggerPolicy: account.singleTriggerPolicy,
          authorityScope: account.authorityScope,
          sortOrder: account.sortOrder,
          status: account.status ?? 'active',
        },
      });
    }

    return this.prisma.topicWatchAccount.findMany({
      where: {
        topicWatchId,
        status: 'active',
      },
      orderBy: {
        sortOrder: 'asc',
      },
    }) as unknown as Promise<TopicWatchAccount[]>;
  }

  async findActiveMonitoringPlan(
    topicWatchId: string,
  ): Promise<TopicMonitoringPlan | null> {
    return this.prisma.topicMonitoringPlan.findFirst({
      where: {
        topicWatchId,
        status: 'active',
      },
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<TopicMonitoringPlan | null>;
  }

  async findLatestMonitoringPlan(
    topicWatchId: string,
  ): Promise<TopicMonitoringPlan | null> {
    return this.prisma.topicMonitoringPlan.findFirst({
      where: {
        topicWatchId,
      },
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<TopicMonitoringPlan | null>;
  }

  async listMonitoringPlans(
    topicWatchId: string,
  ): Promise<TopicMonitoringPlan[]> {
    return this.prisma.topicMonitoringPlan.findMany({
      where: {
        topicWatchId,
      },
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<TopicMonitoringPlan[]>;
  }

  async activateMonitoringPlan(
    topicWatchId: string,
    planId: string,
  ): Promise<TopicMonitoringPlan> {
    return this.prisma.$transaction(async (tx) => {
      await tx.topicMonitoringPlan.updateMany({
        where: {
          topicWatchId,
          status: 'active',
          id: {
            not: planId,
          },
        },
        data: {
          status: 'paused',
        },
      });

      return tx.topicMonitoringPlan.update({
        where: {
          id: planId,
        },
        data: {
          status: 'active',
        },
      });
    }) as unknown as Promise<TopicMonitoringPlan>;
  }

  async getMinimumActiveRefreshIntervalMinutes(): Promise<number | null> {
    const plans = await this.prisma.topicMonitoringPlan.findMany({
      where: {
        status: 'active',
        topicWatch: {
          status: 'active',
        },
      },
      select: {
        refreshPolicy: true,
      },
    });
    const intervals = plans
      .map((plan) => {
        if (
          plan.refreshPolicy &&
          typeof plan.refreshPolicy === 'object' &&
          !Array.isArray(plan.refreshPolicy)
        ) {
          const value = (plan.refreshPolicy as Record<string, unknown>).intervalMinutes;
          return typeof value === 'number' && Number.isFinite(value)
            ? value
            : undefined;
        }
        return undefined;
      })
      .filter((value): value is number => typeof value === 'number');

    if (intervals.length === 0) return null;
    return Math.min(...intervals);
  }

  async listSignalsForTopicWatch(input: {
    topicWatchId: string;
    windowStartAt: Date;
    windowEndAt: Date;
  }): Promise<Signal[]> {
    return this.prisma.signal.findMany({
      where: {
        platform: 'x',
        signalType: 'x_post',
        observedAt: {
          gte: input.windowStartAt,
          lte: input.windowEndAt,
        },
        metadata: {
          path: ['topicWatchId'],
          equals: input.topicWatchId,
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
      take: 200,
    }) as unknown as Promise<Signal[]>;
  }

  async updateActiveMonitoringPlan(
    topicWatchId: string,
    input: UpdateMonitoringPlanInput,
  ): Promise<TopicMonitoringPlan> {
    const activePlan = await this.prisma.topicMonitoringPlan.findFirstOrThrow({
      where: {
        topicWatchId,
        status: 'active',
      },
      orderBy: {
        version: 'desc',
      },
    });

    return this.prisma.topicMonitoringPlan.update({
      where: {
        id: activePlan.id,
      },
      data: {
        ...(input.sources !== undefined
          ? { sources: input.sources as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.triggerRules !== undefined
          ? { triggerRules: input.triggerRules as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.evidenceRequirements !== undefined
          ? {
              evidenceRequirements:
                input.evidenceRequirements as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.refreshPolicy !== undefined
          ? { refreshPolicy: input.refreshPolicy as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    }) as unknown as Promise<TopicMonitoringPlan>;
  }

  async listCandidates(topicWatchId: string): Promise<TopicCandidate[]> {
    const candidates = (await this.prisma.topicCandidate.findMany({
      where: {
        topicWatchId,
      },
      orderBy: {
        lastSeenAt: 'desc',
      },
      take: 500,
    })) as unknown as TopicCandidate[];

    return dedupeCandidates(candidates);
  }

  async listDecisions(topicWatchId: string): Promise<TopicWatchDecision[]> {
    return this.prisma.topicWatchDecision.findMany({
      where: {
        topicWatchId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<TopicWatchDecision[]>;
  }

  async createMonitoringPlan(input: {
    topicWatchId: string;
    version: number;
    sources: JsonObject[];
    triggerRules: JsonObject[];
    evidenceRequirements: JsonObject[];
    refreshPolicy: JsonObject;
    generatedBy: 'agent' | 'human';
    reason: string;
    status?: string;
  }) {
    return this.prisma.topicMonitoringPlan.create({
      data: {
        topicWatch: {
          connect: {
            id: input.topicWatchId,
          },
        },
        version: input.version,
        status: input.status ?? 'draft',
        sources: input.sources as unknown as Prisma.InputJsonValue,
        triggerRules: input.triggerRules as unknown as Prisma.InputJsonValue,
        evidenceRequirements:
          input.evidenceRequirements as unknown as Prisma.InputJsonValue,
        refreshPolicy: input.refreshPolicy as unknown as Prisma.InputJsonValue,
        generatedBy: input.generatedBy,
        reason: input.reason,
      },
    });
  }

  async createCandidate(
    input: CreateTopicCandidateInput,
  ): Promise<TopicCandidate> {
    return this.prisma.topicCandidate.create({
      data: {
        topicWatch: {
          connect: {
            id: input.topicWatchId,
          },
        },
        title: input.title,
        summary: input.summary,
        keywords: input.keywords,
        entities: input.entities,
        firstSeenAt: input.firstSeenAt,
        lastSeenAt: input.lastSeenAt,
        signalCount: input.signalCount,
        postCount: input.postCount,
        accountCount: input.accountCount,
        sourceTypes: input.sourceTypes,
        representativeSignalIds: input.representativeSignalIds,
        evidenceRefs: input.evidenceRefs,
        metrics: input.metrics as Prisma.InputJsonValue,
        clustering: input.clustering as Prisma.InputJsonValue,
        status: input.status,
      },
    }) as unknown as Promise<TopicCandidate>;
  }

  async upsertCandidateByClusterKey(
    input: CreateTopicCandidateInput & { clusterKey?: string },
  ): Promise<TopicCandidate> {
    const clusterKey =
      input.clusterKey ?? getJsonString(input.clustering, 'clusterKey');
    const existingByClusterKey = clusterKey
      ? await this.prisma.topicCandidate.findFirst({
          where: {
            topicWatchId: input.topicWatchId,
            clustering: {
              path: ['clusterKey'],
              equals: clusterKey,
            },
          },
          orderBy: {
            lastSeenAt: 'desc',
          },
        })
      : null;
    const existing =
      existingByClusterKey ??
      (await this.prisma.topicCandidate.findFirst({
        where: {
          topicWatchId: input.topicWatchId,
          title: input.title,
        },
        orderBy: {
          lastSeenAt: 'desc',
        },
      }));

    if (!existing) {
      return this.createCandidate(input);
    }

    return this.prisma.topicCandidate.update({
      where: {
        id: existing.id,
      },
      data: {
        title: input.title,
        summary: input.summary,
        keywords: input.keywords,
        entities: input.entities,
        firstSeenAt: minDate(existing.firstSeenAt, input.firstSeenAt),
        lastSeenAt: maxDate(existing.lastSeenAt, input.lastSeenAt),
        signalCount: input.signalCount,
        postCount: input.postCount,
        accountCount: input.accountCount,
        sourceTypes: input.sourceTypes,
        representativeSignalIds: input.representativeSignalIds,
        evidenceRefs: input.evidenceRefs,
        metrics: input.metrics as Prisma.InputJsonValue,
        clustering: {
          ...toJsonObject(input.clustering),
          clusterKey,
        } as Prisma.InputJsonValue,
        status: existing.status,
      },
    }) as unknown as Promise<TopicCandidate>;
  }

  async findCandidateById(input: {
    topicWatchId: string;
    candidateId: string;
  }): Promise<TopicCandidate | null> {
    return this.prisma.topicCandidate.findFirst({
      where: {
        id: input.candidateId,
        topicWatchId: input.topicWatchId,
      },
    }) as unknown as Promise<TopicCandidate | null>;
  }

  async listSignalsByIds(signalIds: string[]): Promise<Signal[]> {
    if (signalIds.length === 0) return [];

    return this.prisma.signal.findMany({
      where: {
        id: {
          in: signalIds,
        },
      },
    }) as unknown as Promise<Signal[]>;
  }

  async listRecentPostSignalsByAuthor(input: {
    authorHandle: string;
    observedBefore: Date;
    take: number;
  }): Promise<Signal[]> {
    const authorHandle = input.authorHandle.replace(/^@/, '').toLowerCase();

    return this.prisma.$queryRaw<Signal[]>`
      SELECT *
      FROM signals
      WHERE platform = 'x'
        AND "signalType" = 'x_post'
        AND "observedAt" <= ${input.observedBefore}
        AND lower(metadata->>'authorHandle') = ${authorHandle}
      ORDER BY "observedAt" DESC
      LIMIT ${input.take}
    `;
  }

  async listEvidenceBySignalIds(signalIds: string[]) {
    if (signalIds.length === 0) return [];

    return this.prisma.evidenceItem.findMany({
      where: {
        signalId: {
          in: signalIds,
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
    });
  }

  async updateCandidateStatus(input: {
    candidateId: string;
    status: TopicCandidate['status'];
  }): Promise<TopicCandidate> {
    return this.prisma.topicCandidate.update({
      where: {
        id: input.candidateId,
      },
      data: {
        status: input.status,
      },
    }) as unknown as Promise<TopicCandidate>;
  }

  async createDecision(
    input: CreateTopicWatchDecisionInput,
  ): Promise<TopicWatchDecision> {
    return this.prisma.topicWatchDecision.create({
      data: {
        topicWatch: {
          connect: {
            id: input.topicWatchId,
          },
        },
        decision: input.decision,
        title: input.title ?? null,
        summary: input.summary,
        matchedRules: input.matchedRules,
        evidenceRefs: input.evidenceRefs,
        missingData: input.missingData,
        riskNotes: input.riskNotes,
        suggestedPlanChanges:
          (input.suggestedPlanChanges ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        confidence: input.confidence,
      },
    }) as unknown as Promise<TopicWatchDecision>;
  }
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}

function dedupeCandidates(candidates: TopicCandidate[]) {
  const seen = new Set<string>();
  const deduped: TopicCandidate[] = [];

  for (const candidate of candidates) {
    const key =
      getJsonString(candidate.clustering, 'clusterKey') ??
      normalizeCandidateTitle(candidate.title);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function getJsonString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'string' && item.trim() ? item.trim() : undefined;
}

function toJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeCandidateTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, ' ').trim();
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date) {
  return left.getTime() >= right.getTime() ? left : right;
}

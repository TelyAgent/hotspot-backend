import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JsonObject } from '../common/types/json.type';
import { PrismaService } from '../database/prisma.service';
import {
  CreateTopicCandidateInput,
  CreateTopicWatchDecisionInput,
  CreateTopicWatchInput,
  TopicCandidate,
  TopicWatch,
  TopicWatchDecision,
} from './topic-watch.types';

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
    }) as unknown as Promise<TopicWatch | null>;
  }

  async listTopicWatches(): Promise<TopicWatch[]> {
    return this.prisma.topicWatch.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<TopicWatch[]>;
  }

  async listCandidates(topicWatchId: string): Promise<TopicCandidate[]> {
    return this.prisma.topicCandidate.findMany({
      where: {
        topicWatchId,
      },
      orderBy: {
        lastSeenAt: 'desc',
      },
    }) as unknown as Promise<TopicCandidate[]>;
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

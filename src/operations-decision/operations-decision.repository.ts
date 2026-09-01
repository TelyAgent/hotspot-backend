import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  OperationRecommendationDecision,
  OperationRecommendationEvidenceItem,
  PredxNewsItemInput,
} from './operations-decision.types';

@Injectable()
export class OperationsDecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertPredxNewsItem(input: PredxNewsItemInput) {
    return this.prisma.predxNewsItem.upsert({
      where: { externalId: input.externalId },
      create: {
        ...input,
        relatedMarkets: input.relatedMarkets as Prisma.InputJsonValue,
        raw: input.raw as Prisma.InputJsonValue,
      },
      update: {
        eventId: input.eventId,
        factId: input.factId,
        title: input.title,
        newsTitle: input.newsTitle,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        category: input.category,
        publishedAt: input.publishedAt,
        latestAt: input.latestAt,
        primaryMarketTitle: input.primaryMarketTitle,
        primaryMarketUrl: input.primaryMarketUrl,
        primaryMarketConfidence: input.primaryMarketConfidence,
        associatedMarketDisplayScore: input.associatedMarketDisplayScore,
        relatedMarkets: input.relatedMarkets as Prisma.InputJsonValue,
        raw: input.raw as Prisma.InputJsonValue,
      },
    });
  }

  listPredxNewsItems(input: { take?: number } = {}) {
    return this.prisma.predxNewsItem.findMany({
      take: input.take ?? 20,
      orderBy: { publishedAt: 'desc' },
    });
  }

  listRecentEvents(input: { take?: number } = {}) {
    return this.prisma.event.findMany({
      take: input.take ?? 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findRecommendationById(id: string) {
    const recommendation = await this.prisma.operationRecommendation.findUnique({
      where: { id },
      include: {
        predxNewsItem: true,
        angles: { orderBy: { sortOrder: 'asc' } },
        records: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!recommendation) {
      return null;
    }
    return this.attachEvidenceItems([recommendation]).then((items) => items[0]);
  }

  async listRecommendations(input: {
    status?: string;
    basis?: string;
    priority?: string;
    take?: number;
  } = {}) {
    const recommendations = await this.prisma.operationRecommendation.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.basis ? { basis: input.basis } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
      },
      take: input.take ?? 50,
      orderBy: { createdAt: 'desc' },
      include: {
        predxNewsItem: true,
        angles: { orderBy: { sortOrder: 'asc' } },
        records: { orderBy: { createdAt: 'desc' } },
      },
    });
    return this.attachEvidenceItems(recommendations);
  }

  async createRecommendation(input: {
    sourceEventId?: string | null;
    predxNewsItemId?: string | null;
    decision: OperationRecommendationDecision;
    agentRunId?: string | null;
  }) {
    const decision = input.decision;
    const existing = await this.prisma.operationRecommendation.findFirst({
      where: {
        sourceEventId: input.sourceEventId ?? null,
        predxNewsItemId: input.predxNewsItemId ?? null,
        status: {
          not: 'archived',
        },
      },
    });

    const data = {
      sourceEventId: input.sourceEventId ?? null,
      predxNewsItemId: input.predxNewsItemId ?? null,
      title: decision.title,
      summary: decision.summary,
      recommendationLabels: decision.recommendationLabels as Prisma.InputJsonValue,
      basis: decision.basis,
      priority: decision.priority,
      reason: decision.reason,
      productAssociationStatus: decision.predxOpportunity.status,
      productAssociationLevel: decision.predxOpportunity.associationLevel,
      productAssociationRationale: decision.predxOpportunity.rationale,
      selectedProductValue: decision.predxOpportunity.selectedProductValue,
      recommendedProductPage: decision.predxOpportunity.recommendedProductPage,
      recommendedProductUrl: decision.predxOpportunity.recommendedProductUrl,
      urlReason: decision.predxOpportunity.urlReason,
      evidenceRefs: decision.evidenceRefs as Prisma.InputJsonValue,
      riskNotes: decision.riskNotes as Prisma.InputJsonValue,
      missingData: decision.missingData as Prisma.InputJsonValue,
      status: 'pending',
      confidence: decision.confidence,
      agentRunId: input.agentRunId ?? null,
    };

    const recommendation = existing
      ? await this.prisma.operationRecommendation.update({
          where: { id: existing.id },
          data: {
            ...data,
            angles: {
              deleteMany: {},
              create: decision.angles.map((angle, index) => ({
                level: angle.level,
                claim: angle.claim,
                targetUser: angle.targetUser,
                userValue: angle.userValue,
                evidence: angle.evidence as Prisma.InputJsonValue,
                productUrl: angle.productUrl,
                riskNotes: angle.riskNotes as Prisma.InputJsonValue,
                sortOrder: index,
              })),
            },
          },
          include: {
            predxNewsItem: true,
            angles: { orderBy: { sortOrder: 'asc' } },
            records: { orderBy: { createdAt: 'desc' } },
          },
        })
      : await this.prisma.operationRecommendation.create({
          data: {
            ...data,
            angles: {
              create: decision.angles.map((angle, index) => ({
                level: angle.level,
                claim: angle.claim,
                targetUser: angle.targetUser,
                userValue: angle.userValue,
                evidence: angle.evidence as Prisma.InputJsonValue,
                productUrl: angle.productUrl,
                riskNotes: angle.riskNotes as Prisma.InputJsonValue,
                sortOrder: index,
              })),
            },
          },
          include: {
            predxNewsItem: true,
            angles: { orderBy: { sortOrder: 'asc' } },
            records: { orderBy: { createdAt: 'desc' } },
          },
        });

    return this.attachEvidenceItems([recommendation]).then((items) => items[0]);
  }

  listInbox() {
    return this.prisma.operationContextInboxItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  createInboxItem(input: {
    rawContent: string;
    source?: string;
    sourceUrl?: string;
  }) {
    const title = input.rawContent.trim().slice(0, 48);
    return this.prisma.operationContextInboxItem.create({
      data: {
        title: title || '人工提交上下文',
        source: input.source?.trim() || '人工提交',
        sourceUrl: input.sourceUrl?.trim() || null,
        rawContent: input.rawContent,
        summary: '已进入上下文收件箱，等待 Agent 解析。',
        quality: '待判断',
        status: 'pending',
        conclusion: '待判断',
      },
    });
  }

  async listRecords() {
    const records = await this.prisma.operationDecisionRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        recommendation: {
          include: {
            predxNewsItem: true,
            angles: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    const recommendations = await this.attachEvidenceItems(records.map((record) => record.recommendation));
    return records.map((record, index) => ({
      ...record,
      recommendation: recommendations[index],
    }));
  }

  async recordRecommendationDecision(input: {
    recommendationId: string;
    result: string;
    recommendationStatus: string;
    finalAngle?: string | null;
    note?: string | null;
    operator?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    const recordWithRecommendation = await this.prisma.$transaction(async (tx) => {
      const record = await tx.operationDecisionRecord.create({
        data: {
          recommendationId: input.recommendationId,
          result: input.result,
          finalAngle: input.finalAngle ?? null,
          note: input.note ?? null,
          operator: input.operator ?? null,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      });

      await tx.operationRecommendation.update({
        where: { id: input.recommendationId },
        data: { status: input.recommendationStatus },
      });

      return tx.operationDecisionRecord.findUniqueOrThrow({
        where: { id: record.id },
        include: {
          recommendation: {
            include: {
              predxNewsItem: true,
              angles: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      });
    });
    const [recommendation] = await this.attachEvidenceItems([recordWithRecommendation.recommendation]);
    return {
      ...recordWithRecommendation,
      recommendation,
    };
  }

  private async attachEvidenceItems<T extends { evidenceRefs: unknown }>(
    recommendations: T[],
  ): Promise<Array<T & { evidenceItems: OperationRecommendationEvidenceItem[] }>> {
    const ids = [...new Set(recommendations.flatMap((item) => readStringArray(item.evidenceRefs)))];
    if (ids.length === 0) {
      return recommendations.map((item) => ({ ...item, evidenceItems: [] }));
    }

    const evidenceItems = await this.prisma.evidenceItem.findMany({
      where: { id: { in: ids } },
    });
    const evidenceById = new Map(
      evidenceItems.map((item) => [item.id, toOperationEvidenceItem(item)]),
    );

    return recommendations.map((item) => ({
      ...item,
      evidenceItems: readStringArray(item.evidenceRefs)
        .map((id) => evidenceById.get(id))
        .filter((evidence): evidence is OperationRecommendationEvidenceItem => Boolean(evidence)),
    }));
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function toOperationEvidenceItem(item: {
  id: string;
  sourceType: string;
  sourceTool: string | null;
  sourceItemId: string | null;
  claim: string;
  text: string | null;
  url: string | null;
  author: string | null;
  publishedAt: Date | null;
  observedAt: Date;
  metrics: Prisma.JsonValue | null;
  confidence: string;
  metadata: Prisma.JsonValue | null;
}): OperationRecommendationEvidenceItem {
  const metadata = toRecord(item.metadata);
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceName: item.sourceTool ?? item.sourceType,
    authorName:
      item.author ??
      readString(metadata.authorHandle) ??
      readString(metadata.authorName) ??
      readString(metadata.channelTitle),
    title:
      readString(metadata.title) ??
      item.sourceItemId ??
      readString(metadata.postId) ??
      readString(metadata.videoId),
    summary: item.claim,
    text: item.text,
    url: item.url ?? readString(metadata.url),
    publishedAt: item.publishedAt?.toISOString() ?? null,
    observedAt: item.observedAt.toISOString(),
    metrics: item.metrics,
    confidence: item.confidence,
  };
}

function toRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

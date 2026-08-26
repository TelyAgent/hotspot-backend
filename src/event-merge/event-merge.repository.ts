import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Event } from '../opportunity/opportunity.types';
import {
  CreateEventRelationInput,
  CreateMergeDecisionInput,
  CreateSourceContextInput,
  EventMergeDecision,
  EventRelationDto,
  EventSourceContext,
} from './event-merge.types';

@Injectable()
export class EventMergeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSourceContext(
    input: CreateSourceContextInput,
  ): Promise<EventSourceContext> {
    return this.prisma.eventSourceContext.create({
      data: {
        mainEventId: input.mainEventId ?? null,
        sourceEventId: input.sourceEventId ?? null,
        sourceType: input.sourceType,
        triggerType: input.triggerType,
        triggerRuleCode: input.triggerRuleCode ?? null,
        ruleVersion: input.ruleVersion ?? null,
        contextVersion: input.contextVersion ?? 1,
        title: input.title,
        summary: input.summary,
        identity: input.identity as unknown as Prisma.InputJsonValue,
        evidenceRefs: input.evidenceRefs,
        signalRefs: input.signalRefs,
        payload: input.payload as Prisma.InputJsonObject,
        triggeredAt: input.triggeredAt,
      },
    }) as unknown as Promise<EventSourceContext>;
  }

  async createMergeDecision(
    input: CreateMergeDecisionInput,
  ): Promise<EventMergeDecision> {
    return this.prisma.eventMergeDecision.create({
      data: {
        incomingContextId: input.incomingContextId,
        candidateMainEventId: input.candidateMainEventId ?? null,
        decision: input.decision,
        mergeConfidence: input.mergeConfidence,
        hardConflict: input.hardConflict,
        dimensionResults:
          input.dimensionResults as unknown as Prisma.InputJsonValue,
        conflictPoints: input.conflictPoints,
        evidenceRefs: input.evidenceRefs,
        impact: input.impact as unknown as Prisma.InputJsonValue,
        agentRunId: input.agentRunId ?? null,
        decidedBy: input.decidedBy,
      },
    }) as unknown as Promise<EventMergeDecision>;
  }

  async createEventRelation(
    input: CreateEventRelationInput,
  ): Promise<EventRelationDto> {
    return this.prisma.eventRelation.upsert({
      where: {
        fromEventId_toEventId_relationType: {
          fromEventId: input.fromEventId,
          toEventId: input.toEventId,
          relationType: input.relationType,
        },
      },
      create: {
        fromEventId: input.fromEventId,
        toEventId: input.toEventId,
        relationType: input.relationType,
        reason: input.reason,
        evidenceRefs: input.evidenceRefs,
        createdBy: input.createdBy,
      },
      update: {
        reason: input.reason,
        evidenceRefs: input.evidenceRefs,
        createdBy: input.createdBy,
      },
    }) as unknown as Promise<EventRelationDto>;
  }

  async listSourceContexts(mainEventId: string): Promise<EventSourceContext[]> {
    return this.prisma.eventSourceContext.findMany({
      where: { mainEventId },
      orderBy: { triggeredAt: 'asc' },
    }) as unknown as Promise<EventSourceContext[]>;
  }

  async findCandidateMainEvents(
    context: EventSourceContext,
    input: { take?: number } = {},
  ): Promise<Event[]> {
    const keywords = uniqueStrings([
      context.identity.subject,
      context.identity.object,
      context.title,
    ]).filter((keyword) => keyword.length >= 2);

    if (keywords.length === 0) {
      return [];
    }

    return this.prisma.event.findMany({
      where: {
        id: context.mainEventId
          ? {
              not: context.mainEventId,
            }
          : undefined,
        canonicalEventId: null,
        OR: keywords.flatMap((keyword) => [
          {
            title: {
              contains: keyword,
              mode: 'insensitive' as const,
            },
          },
          {
            summary: {
              contains: keyword,
              mode: 'insensitive' as const,
            },
          },
        ]),
      },
      take: input.take ?? 5,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<Event[]>;
  }

  async attachSourceContextToMainEvent(input: {
    contextId: string;
    mainEventId: string;
  }): Promise<EventSourceContext> {
    return this.prisma.eventSourceContext.update({
      where: { id: input.contextId },
      data: {
        mainEventId: input.mainEventId,
      },
    }) as unknown as Promise<EventSourceContext>;
  }

  async markEventMergedIntoCanonical(input: {
    eventId: string;
    canonicalEventId: string;
  }): Promise<Event> {
    return this.prisma.event.update({
      where: { id: input.eventId },
      data: {
        canonicalEventId: input.canonicalEventId,
        status: 'archived',
      },
    }) as unknown as Promise<Event>;
  }

  async getLatestMergeDecision(
    mainEventId: string,
  ): Promise<EventMergeDecision | null> {
    return this.prisma.eventMergeDecision.findFirst({
      where: { candidateMainEventId: mainEventId },
      orderBy: { decidedAt: 'desc' },
    }) as unknown as Promise<EventMergeDecision | null>;
  }

  async listRelations(eventId: string): Promise<EventRelationDto[]> {
    return this.prisma.eventRelation.findMany({
      where: {
        OR: [{ fromEventId: eventId }, { toEventId: eventId }],
      },
      orderBy: { createdAt: 'desc' },
    }) as unknown as Promise<EventRelationDto[]>;
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

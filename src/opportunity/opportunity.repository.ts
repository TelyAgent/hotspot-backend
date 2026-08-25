import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateEventInput,
  CreateOpportunityInput,
  CreateOpportunityMiningSignalRunInput,
  CreateOpportunityRulePackInput,
  Event,
  Opportunity,
  OpportunityMiningSignalRun,
  OpportunityMiningSignalRunWithSignal,
  OpportunityRulePackRecord,
} from './opportunity.types';

@Injectable()
export class OpportunityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSimilarOpportunities(query: string): Promise<Opportunity[]> {
    return this.prisma.opportunity.findMany({
      where: {
        title: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<Opportunity[]>;
  }

  async findSimilarEvents(query: string): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: {
        title: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<Event[]>;
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
    return this.prisma.opportunity.create({
      data: {
        title: input.title,
        type: input.type,
        summary: input.summary,
        whyNow: input.whyNow,
        whyItMatters: input.whyItMatters,
        productAngles: input.productAngles,
        contentWindow: input.contentWindow,
        evidenceRefs: input.evidenceRefs,
        missingData: input.missingData,
        riskNotes: input.riskNotes,
        confidence: input.confidence,
        status: input.status ?? 'suggested',
      },
    }) as unknown as Promise<Opportunity>;
  }

  async listOpportunities(input: {
    status?: string;
    take?: number;
  } = {}): Promise<Opportunity[]> {
    return this.prisma.opportunity.findMany({
      where: input.status
        ? {
            status: input.status,
          }
        : undefined,
      take: input.take ?? 50,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<Opportunity[]>;
  }

  async findOpportunityById(id: string): Promise<Opportunity | null> {
    return this.prisma.opportunity.findUnique({
      where: { id },
    }) as unknown as Promise<Opportunity | null>;
  }

  async updateOpportunityStatus(input: {
    id: string;
    status: Opportunity['status'];
  }): Promise<Opportunity> {
    return this.prisma.opportunity.update({
      where: { id: input.id },
      data: {
        status: input.status,
      },
    }) as unknown as Promise<Opportunity>;
  }

  async createEvent(input: CreateEventInput): Promise<Event> {
    return this.prisma.event.create({
      data: {
        title: input.title,
        eventType: input.eventType,
        summary: input.summary,
        occurredAt: input.occurredAt ?? null,
        evidenceRefs: input.evidenceRefs,
        missingData: input.missingData,
        riskNotes: input.riskNotes,
        confidence: input.confidence,
        status: input.status ?? 'suggested',
      },
    }) as unknown as Promise<Event>;
  }

  async listEvents(input: {
    status?: string;
    take?: number;
  } = {}): Promise<Event[]> {
    return this.prisma.event.findMany({
      where: input.status
        ? {
            status: input.status,
          }
        : undefined,
      take: input.take ?? 50,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<Event[]>;
  }

  async findEventById(id: string): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
    }) as unknown as Promise<Event | null>;
  }

  async updateEventStatus(input: {
    id: string;
    status: Event['status'];
  }): Promise<Event> {
    return this.prisma.event.update({
      where: { id: input.id },
      data: {
        status: input.status,
      },
    }) as unknown as Promise<Event>;
  }

  async createRulePack(
    input: CreateOpportunityRulePackInput,
  ): Promise<OpportunityRulePackRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (input.status === 'active') {
        await tx.opportunityRulePack.updateMany({
          where: {
            status: 'active',
          },
          data: {
            status: 'archived',
          },
        });
      }

      return tx.opportunityRulePack.create({
        data: {
          version: input.version,
          status: input.status,
          basePath: input.basePath,
          manifest: input.manifest as Prisma.InputJsonValue,
          description: input.description ?? null,
          generatedBy: input.generatedBy,
        },
      }) as unknown as Promise<OpportunityRulePackRecord>;
    });
  }

  async findActiveRulePack(): Promise<OpportunityRulePackRecord | null> {
    return this.prisma.opportunityRulePack.findFirst({
      where: {
        status: 'active',
      },
      orderBy: {
        version: 'desc',
      },
    }) as unknown as Promise<OpportunityRulePackRecord | null>;
  }

  async findRulePackById(id: string): Promise<OpportunityRulePackRecord | null> {
    return this.prisma.opportunityRulePack.findUnique({
      where: {
        id,
      },
    }) as unknown as Promise<OpportunityRulePackRecord | null>;
  }

  async findLatestRulePackVersion(): Promise<number> {
    const latest = await this.prisma.opportunityRulePack.findFirst({
      orderBy: {
        version: 'desc',
      },
      select: {
        version: true,
      },
    });

    return latest?.version ?? 0;
  }

  async activateRulePack(id: string): Promise<OpportunityRulePackRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.opportunityRulePack.updateMany({
        where: {
          status: 'active',
          id: {
            not: id,
          },
        },
        data: {
          status: 'archived',
        },
      });

      return tx.opportunityRulePack.update({
        where: {
          id,
        },
        data: {
          status: 'active',
        },
      });
    }) as unknown as Promise<OpportunityRulePackRecord>;
  }

  async createMiningSignalRun(
    input: CreateOpportunityMiningSignalRunInput,
  ): Promise<OpportunityMiningSignalRun> {
    return this.prisma.opportunityMiningSignalRun.create({
      data: {
        signalId: input.signalId,
        agentRunId: input.agentRunId ?? null,
        rulePackId: input.rulePackId ?? null,
        status: input.status,
        decision: input.decision ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        idempotencyKey: input.idempotencyKey,
        errorMessage: input.errorMessage ?? null,
      },
    }) as unknown as Promise<OpportunityMiningSignalRun>;
  }

  async findRecentMiningRunBySignal(
    signalId: string,
  ): Promise<OpportunityMiningSignalRun | null> {
    return this.prisma.opportunityMiningSignalRun.findFirst({
      where: {
        signalId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<OpportunityMiningSignalRun | null>;
  }

  async listMiningSignalRuns(input: {
    status?: string;
    signalId?: string;
    take?: number;
  } = {}): Promise<OpportunityMiningSignalRunWithSignal[]> {
    return this.prisma.opportunityMiningSignalRun.findMany({
      where: {
        status: input.status,
        signalId: input.signalId,
      },
      include: {
        signal: {
          select: {
            id: true,
            title: true,
            signalType: true,
            source: true,
            platform: true,
            observedAt: true,
          },
        },
      },
      take: input.take ?? 50,
      orderBy: {
        createdAt: 'desc',
      },
    }) as unknown as Promise<OpportunityMiningSignalRunWithSignal[]>;
  }
}

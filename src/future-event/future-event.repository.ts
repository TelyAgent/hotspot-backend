import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateFutureEventInput,
  CreateFutureEventMonitoringPlanInput,
  FutureEvent,
  FutureEventMonitoringPlan,
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
}

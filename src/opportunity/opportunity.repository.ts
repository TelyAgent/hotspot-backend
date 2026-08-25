import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateEventInput,
  CreateOpportunityInput,
  Event,
  Opportunity,
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
}

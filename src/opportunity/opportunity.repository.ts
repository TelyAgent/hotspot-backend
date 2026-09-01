import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JsonObject } from '../common/types/json.type';
import { PrismaService } from '../database/prisma.service';
import {
  CreateEventInput,
  CreateOpportunityInput,
  CreateOpportunityMiningSignalRunInput,
  CreateOpportunityRulePackInput,
  Event,
  EventLabel,
  EventListResult,
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
        labels: (input.labels ?? []) as unknown as Prisma.InputJsonValue,
        identity: (input.identity ?? undefined) as unknown as Prisma.InputJsonValue,
        contextVersion: input.contextVersion ?? 1,
        confidence: input.confidence,
        status: input.status ?? 'suggested',
      },
    }) as unknown as Promise<Event>;
  }

  async findActiveEventByAnyEvidenceRef(evidenceRefs: string[]): Promise<Event | null> {
    const refs = Array.from(new Set(evidenceRefs.filter((ref) => ref.trim().length > 0)));
    if (refs.length === 0) {
      return null;
    }

    const rows = await this.prisma.$queryRaw<Event[]>`
      SELECT *
      FROM "events"
      WHERE "canonicalEventId" IS NULL
        AND "status" <> 'archived'
        AND "evidenceRefs"::jsonb ?| ${refs}
      ORDER BY "createdAt" ASC
      LIMIT 1
    `;

    return (rows[0] ?? null) as unknown as Event | null;
  }

  async updateEventFromDuplicateEvidence(input: {
    id: string;
    title: string;
    eventType: string;
    summary: string;
    evidenceRefs: string[];
    missingData: string[];
    riskNotes: string[];
    labels?: EventLabel[];
    identity?: JsonObject;
    confidence: Event['confidence'];
  }): Promise<Event> {
    const existing = await this.findEventById(input.id);
    const mergedEvidenceRefs = uniqueStrings([
      ...normalizeStringArray(existing?.evidenceRefs),
      ...input.evidenceRefs,
    ]);
    const mergedMissingData = uniqueStrings([
      ...normalizeStringArray(existing?.missingData),
      ...input.missingData,
    ]);
    const mergedRiskNotes = uniqueStrings([
      ...normalizeStringArray(existing?.riskNotes),
      ...input.riskNotes,
    ]);
    const mergedLabels = mergeEventLabels(
      Array.isArray(existing?.labels) ? existing.labels : [],
      input.labels ?? [],
    );

    return this.prisma.event.update({
      where: { id: input.id },
      data: {
        title: input.title,
        eventType: input.eventType,
        summary: input.summary,
        evidenceRefs: mergedEvidenceRefs,
        missingData: mergedMissingData,
        riskNotes: mergedRiskNotes,
        labels: mergedLabels as unknown as Prisma.InputJsonValue,
        identity: (input.identity ?? undefined) as unknown as Prisma.InputJsonValue,
        confidence: input.confidence,
        contextVersion: {
          increment: 1,
        },
      },
    }) as unknown as Promise<Event>;
  }

  async listEvents(input: {
    status?: string;
    label?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<EventListResult> {
    const page = Math.max(input.page ?? 1, 1);
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const where = buildEventListWhere(input);
    const countRows = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total
      FROM "events"
      ${where}
    `;
    const items = await this.prisma.$queryRaw<Event[]>`
      SELECT *
      FROM "events"
      ${where}
      ORDER BY "createdAt" DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `;

    return {
      items: items as unknown as Event[],
      total: countRows[0]?.total ?? 0,
      page,
      pageSize,
    };
  }

  async findEventById(id: string): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
    }) as unknown as Promise<Event | null>;
  }

  async listEventsForMcp(input: {
    query?: string;
    domains?: string[];
    sources?: string[];
    labels?: string[];
    since?: Date;
    limit?: number;
  } = {}): Promise<Event[]> {
    const where = buildMcpEventWhere(input);
    const limit = input.limit ?? 50;

    return this.prisma.$queryRaw<Event[]>`
      SELECT *
      FROM "events"
      ${where}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    ` as unknown as Promise<Event[]>;
  }

  async findEventForMcp(id: string): Promise<Event | null> {
    return this.findEventById(id);
  }

  async listEvidenceForMcp(evidenceRefs: string[]): Promise<unknown[]> {
    if (!evidenceRefs.length) {
      return [];
    }

    return this.prisma.evidenceItem.findMany({
      where: {
        id: {
          in: evidenceRefs,
        },
      },
      orderBy: [
        {
          publishedAt: 'asc',
        },
        {
          observedAt: 'asc',
        },
      ],
    }) as unknown as Promise<unknown[]>;
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

function buildEventListWhere(input: { status?: string; label?: string }) {
  const filters: Prisma.Sql[] = [];
  const status = input.status?.trim();
  const label = input.label?.trim();

  if (status) {
    filters.push(Prisma.sql`"status" = ${status}`);
  } else {
    filters.push(Prisma.sql`"status" <> 'archived'`);
  }

  filters.push(Prisma.sql`"canonicalEventId" IS NULL`);

  if (label) {
    filters.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE("labels"::jsonb, '[]'::jsonb)) AS event_label
        WHERE event_label->>'name' = ${label}
           OR event_label->>'code' = ${label}
      )
    `);
  }

  if (!filters.length) {
    return Prisma.empty;
  }

  return Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
}

function buildMcpEventWhere(input: {
  query?: string;
  domains?: string[];
  sources?: string[];
  labels?: string[];
  since?: Date;
}) {
  const filters: Prisma.Sql[] = [];
  const query = input.query?.trim();
  const labels = [
    ...(input.domains ?? []),
    ...(input.sources ?? []),
    ...(input.labels ?? []),
  ]
    .map((label) => label.trim())
    .filter(Boolean);

  if (query) {
    filters.push(Prisma.sql`("title" ILIKE ${`%${query}%`} OR "summary" ILIKE ${`%${query}%`})`);
  }

  if (input.since) {
    filters.push(Prisma.sql`"updatedAt" >= ${input.since}`);
  }

  if (labels.length) {
    filters.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE("labels"::jsonb, '[]'::jsonb)) AS event_label
        WHERE event_label->>'name' IN (${Prisma.join(labels)})
           OR event_label->>'code' IN (${Prisma.join(labels)})
      )
    `);
  }

  if (!filters.length) {
    return Prisma.empty;
  }

  return Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergeEventLabels(left: Event['labels'] | undefined | null, right: EventLabel[]): EventLabel[] {
  const merged = new Map<string, EventLabel>();
  for (const label of [...(left ?? []), ...right]) {
    const key = `${label.category}:${label.code}`;
    const existing = merged.get(key);
    merged.set(key, {
      ...label,
      evidenceRefs: uniqueStrings([
        ...(existing?.evidenceRefs ?? []),
        ...label.evidenceRefs,
      ]),
      confidence: existing?.confidence === 'high' ? existing.confidence : label.confidence,
    });
  }
  return [...merged.values()];
}

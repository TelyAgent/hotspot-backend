import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JsonObject, JsonValue } from '../../../common/types/json.type';
import { PrismaService } from '../../../database/prisma.service';
import { CreateRawItemInput } from '../../../signal/raw-item/raw-item.types';

interface TrendSnapshotItemInput {
  name: string;
  query: string;
  region: string;
  rank: number;
  url?: string | null;
  heat?: string | null;
  category?: string | null;
  raw?: JsonValue;
  metadata?: JsonValue | null;
}

@Injectable()
export class XTrendSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async createSnapshotsForCollection(input: {
    collectionRunId: string;
    observedAt: Date;
    rawItems: CreateRawItemInput[];
  }): Promise<void> {
    const grouped = this.groupByRegion(input.rawItems);

    for (const [region, items] of grouped.entries()) {
      const previousSnapshot = await this.prisma.xTrendSnapshot.findFirst({
        where: {
          region,
          observedAt: {
            lt: input.observedAt,
          },
        },
        include: {
          items: true,
        },
        orderBy: {
          observedAt: 'desc',
        },
      });
      const snapshot = await this.prisma.xTrendSnapshot.create({
        data: {
          collectionRunId: input.collectionRunId,
          region,
          observedAt: input.observedAt,
          itemCount: items.length,
          metadata: {
            sourceType: 'x_trend',
          },
          items: {
            create: items.map((item) => ({
              name: item.name,
              query: item.query,
              rank: item.rank,
              url: item.url ?? null,
              heat: item.heat ?? null,
              category: item.category ?? null,
              raw: this.toInputJsonValue(item.raw),
              metadata: this.toInputJsonValue(item.metadata),
            })),
          },
        },
      });
      const diffs = this.createDiffs({
        snapshotId: snapshot.id,
        previousSnapshotId: previousSnapshot?.id ?? null,
        region,
        observedAt: input.observedAt,
        currentItems: items,
        previousItems:
          previousSnapshot?.items.map((item) => ({
            name: item.name,
            query: item.query,
            rank: item.rank,
          })) ?? [],
      });

      if (diffs.length > 0) {
        await this.prisma.xTrendSnapshotDiff.createMany({
          data: diffs,
        });
      }
    }
  }

  private groupByRegion(rawItems: CreateRawItemInput[]) {
    const grouped = new Map<string, TrendSnapshotItemInput[]>();

    for (const rawItem of rawItems) {
      const payload = isJsonObject(rawItem.payload) ? rawItem.payload : {};
      const metadata = isJsonObject(rawItem.metadata) ? rawItem.metadata : {};
      const region =
        getString(payload.region) ?? getString(metadata.region) ?? 'global';
      const name = getString(payload.name) ?? getString(payload.query);
      const query = getString(payload.query) ?? name;
      const rank = getNumber(payload.rank, getNumber(metadata.rank, 0));

      if (!name || !query || rank <= 0) {
        continue;
      }

      const items = grouped.get(region) ?? [];
      items.push({
        name,
        query,
        region,
        rank,
        url: getString(payload.url) ?? null,
        heat: getString(payload.heat) ?? null,
        category: getString(payload.category) ?? null,
        raw: payload.raw,
        metadata: rawItem.metadata,
      });
      grouped.set(region, items);
    }

    for (const items of grouped.values()) {
      items.sort((left, right) => left.rank - right.rank);
    }

    return grouped;
  }

  private createDiffs(input: {
    snapshotId: string;
    previousSnapshotId: string | null;
    region: string;
    observedAt: Date;
    currentItems: TrendSnapshotItemInput[];
    previousItems: Array<{
      name: string;
      query: string;
      rank: number;
    }>;
  }): Prisma.XTrendSnapshotDiffCreateManyInput[] {
    const previousByQuery = new Map(
      input.previousItems.map((item) => [normalizeQuery(item.query), item]),
    );
    const currentByQuery = new Set(
      input.currentItems.map((item) => normalizeQuery(item.query)),
    );
    const currentDiffs = input.currentItems.map((item) => {
      const previous = previousByQuery.get(normalizeQuery(item.query));
      const rankDelta =
        previous?.rank !== undefined ? previous.rank - item.rank : null;

      return {
        snapshotId: input.snapshotId,
        previousSnapshotId: input.previousSnapshotId,
        region: input.region,
        name: item.name,
        query: item.query,
        previousRank: previous?.rank ?? null,
        currentRank: item.rank,
        rankDelta,
        diffType: this.getDiffType(rankDelta, previous?.rank ?? null, item.rank),
        observedAt: input.observedAt,
      };
    });
    const droppedDiffs = input.previousItems
      .filter((item) => !currentByQuery.has(normalizeQuery(item.query)))
      .map((item) => ({
        snapshotId: input.snapshotId,
        previousSnapshotId: input.previousSnapshotId,
        region: input.region,
        name: item.name,
        query: item.query,
        previousRank: item.rank,
        currentRank: null,
        rankDelta: null,
        diffType: 'dropped',
        observedAt: input.observedAt,
      }));

    return [...currentDiffs, ...droppedDiffs];
  }

  private getDiffType(
    rankDelta: number | null,
    previousRank: number | null,
    currentRank: number,
  ) {
    if (previousRank === null) {
      return 'new';
    }

    if (rankDelta === null || rankDelta === 0) {
      return 'unchanged';
    }

    return rankDelta > 0 ? 'up' : 'down';
  }

  private toInputJsonValue(value: JsonValue | null | undefined) {
    return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


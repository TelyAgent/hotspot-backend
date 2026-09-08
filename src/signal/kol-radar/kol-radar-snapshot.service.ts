import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProjectConfigService } from '../../project-config/project-config.service';

type KolRadarSourceRow = {
  handle: string;
  authorName: string | null;
  title: string;
  summary: string;
  observedAt: Date;
  publishedAt: string | null;
  postType: string | null;
  url: string | null;
  metrics: Record<string, number>;
  signalId: string | null;
  rawItemId: string | null;
  sourceItemId: string | null;
  metadata: unknown;
};

type SavedRawItemLike = {
  id: string;
  sourceItemId?: string | null;
  payload?: unknown;
  metadata?: unknown;
};

type SavedSignalLike = {
  id: string;
  title: string;
  summary?: string | null;
  observedAt: Date;
  metrics?: unknown;
  metadata?: unknown;
};

type SavedSignalWithRawItemLike = SavedSignalLike & {
  rawItem: SavedRawItemLike;
};

@Injectable()
export class KolRadarSnapshotService implements OnModuleInit {
  private readonly logger = new Logger(KolRadarSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectConfigService: ProjectConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureLatestSnapshot().catch((error) => {
      this.logger.warn(
        `KOL radar snapshot backfill skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async findLatestFeed(input: { take?: number; includeRaw?: boolean } = {}) {
    await this.ensureLatestSnapshot();

    const snapshot = await this.prisma.kolRadarSnapshot.findFirst({
      orderBy: {
        observedAt: 'desc',
      },
      include: {
        items: {
          orderBy: {
            rank: 'asc',
          },
          take: input.take ?? 30,
        },
      },
    });

    const items =
      snapshot?.items.map((item) => ({
        id: item.id,
        handle: item.handle,
        authorName: item.authorName ?? null,
        title: item.title,
        summary: item.summary,
        observedAt: item.observedAt.toISOString(),
        publishedAt: item.publishedAt ?? null,
        postType: item.postType ?? null,
        url: item.url ?? null,
        metrics: normalizeMetrics(item.metrics),
      })) ?? [];

    const response = {
      collectedAt: snapshot?.observedAt.toISOString() ?? new Date().toISOString(),
      windowHours:
        readNumberFromJson(snapshot?.metadata, 'windowHours') ??
        6,
      items,
    };

    if (!input.includeRaw) {
      return response;
    }

    return {
      ...response,
      debug: {
        snapshotId: snapshot?.id ?? null,
        collectionRunId: snapshot?.collectionRunId ?? null,
        itemCount: snapshot?.itemCount ?? items.length,
        selectedHandles: items.map((item) => item.handle),
        items,
      },
    };
  }

  async createSnapshotsForCollection(input: {
    collectionRunId: string;
    observedAt: Date;
    items: Array<{ rawItem: SavedRawItemLike; signal: SavedSignalLike }>;
  }): Promise<void> {
    const config = await this.projectConfigService.getXTrendCollectionConfig();
    const minViews = config.kolRadarMinViews;
    const candidateCount = input.items.length;
    const rows = input.items
      .map(({ rawItem, signal }) => this.toSourceRowFromSavedSignal({ rawItem, signal }))
      .filter((row) => getMetricNumber(row.metrics, 'views', 'viewCount') >= minViews);

    await this.persistSnapshot({
      collectionRunId: input.collectionRunId,
      observedAt: input.observedAt,
      rows,
      metadata: {
        source: 'x-account-posts',
        collectionRunId: input.collectionRunId,
        rawItemCount: candidateCount,
        qualifiedItemCount: rows.length,
        groupedHandleCount: new Set(rows.map((row) => normalizeHandle(row.handle))).size,
        windowHours: 6,
        minViews,
      },
    });
  }

  private async ensureLatestSnapshot(): Promise<void> {
    const currentConfig = await this.projectConfigService.getXTrendCollectionConfig();
    const minViews = currentConfig.kolRadarMinViews;

    const latestRun = await this.prisma.collectionRun.findFirst({
      where: {
        jobId: {
          startsWith: 'x-kol-radar-',
        },
        status: 'succeeded',
      },
      orderBy: {
        startedAt: 'desc',
      },
      select: {
        id: true,
        startedAt: true,
        outputSummary: true,
      },
    });

    if (!latestRun) {
      return;
    }

    const existing = await this.prisma.kolRadarSnapshot.findUnique({
      where: {
        collectionRunId: latestRun.id,
      },
      select: {
        id: true,
        metadata: true,
      },
    });

    if (existing && readNumberFromJson(existing.metadata, 'minViews') === minViews) {
      return;
    }

    const collectedAt =
      getIsoString(latestRun.outputSummary, 'collectedAt') ?? latestRun.startedAt.toISOString();
    const observedAt = new Date(collectedAt);

    const signals = (await this.prisma.signal.findMany({
      where: {
        source: 'x',
        signalType: 'x_post',
        observedAt,
      },
      include: {
        rawItem: true,
      },
      orderBy: [
        {
          observedAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    })) as SavedSignalWithRawItemLike[];

    const candidateRows = signals.map((signal) =>
      this.toSourceRowFromSavedSignal({
        rawItem: signal.rawItem,
        signal,
      }),
    );
    const rows = candidateRows.filter(
      (row) => getMetricNumber(row.metrics, 'views', 'viewCount') >= minViews,
    );

    await this.persistSnapshot({
      collectionRunId: latestRun.id,
      observedAt,
      rows,
      metadata: {
        source: 'backfill',
        collectionRunId: latestRun.id,
        rawItemCount: signals.length,
        qualifiedItemCount: rows.length,
        groupedHandleCount: new Set(
          candidateRows.map((row) => normalizeHandle(row.handle)),
        ).size,
        windowHours: 6,
        minViews,
      },
    });
    this.logger.log(`Backfilled latest KOL radar snapshot for run ${latestRun.id}`);
  }

  private async persistSnapshot(input: {
    collectionRunId: string;
    observedAt: Date;
    rows: KolRadarSourceRow[];
    metadata: unknown;
  }): Promise<void> {
    const grouped = this.groupRows(input.rows);
    const items = Array.from(grouped.values())
      .sort((a, b) => compareSourceRows(b[0], a[0]))
      .map((rows, index) => {
        const row = rows[0];
        return {
          rank: index + 1,
          handle: row.handle,
          authorName: row.authorName,
          title: row.title,
          summary: row.summary,
          observedAt: row.observedAt,
          publishedAt: row.publishedAt,
          postType: row.postType,
          url: row.url,
          metrics: row.metrics as Prisma.InputJsonValue,
          signalId: row.signalId,
          rawItemId: row.rawItemId,
          sourceItemId: row.sourceItemId,
          metadata: row.metadata ?? Prisma.JsonNull,
        };
      });

    await this.prisma.kolRadarSnapshot.upsert({
      where: {
        collectionRunId: input.collectionRunId,
      },
      create: {
        collectionRunId: input.collectionRunId,
        observedAt: input.observedAt,
        itemCount: items.length,
        metadata: input.metadata as Prisma.InputJsonValue,
        items: {
          create: items,
        },
      },
      update: {
        observedAt: input.observedAt,
        itemCount: items.length,
        metadata: input.metadata as Prisma.InputJsonValue,
        items: {
          deleteMany: {},
          create: items,
        },
      },
    });
  }

  private groupRows(rows: KolRadarSourceRow[]) {
    const grouped = new Map<string, KolRadarSourceRow[]>();

    for (const row of rows) {
      const key = normalizeHandle(row.handle).toLowerCase();
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }

    for (const items of grouped.values()) {
      items.sort((a, b) => compareSourceRows(a, b));
    }

    return grouped;
  }

  private toSourceRowFromSavedSignal(input: {
    rawItem: SavedRawItemLike;
    signal: SavedSignalLike;
  }): KolRadarSourceRow {
    const rawMetadata = isObject(input.rawItem.metadata) ? input.rawItem.metadata : {};
    const signalMetadata = isObject(input.signal.metadata) ? input.signal.metadata : {};
    const payload = isObject(input.rawItem.payload) ? input.rawItem.payload : {};
    const title = input.signal.title?.trim() || getString(payload.text) || '';
    const summary = input.signal.summary?.trim() || title;
    const handle =
      normalizeHandle(
        getString(signalMetadata.authorHandle) ??
          getString(rawMetadata.handle) ??
          getString(payload.authorHandle) ??
          getHandleFromTitle(input.signal.title),
      ) || 'unknown';

    return {
      handle,
      authorName:
        getString(signalMetadata.authorName) ??
        getString(payload.authorName) ??
        null,
      title,
      summary,
      observedAt: input.signal.observedAt,
      publishedAt:
        getString(signalMetadata.publishedAt) ??
        getString(payload.publishedAt) ??
        null,
      postType:
        getString(signalMetadata.postType) ??
        getString(payload.postType) ??
        null,
      url:
        getString(signalMetadata.url) ??
        getString(payload.url) ??
        null,
      metrics: normalizeMetrics(input.signal.metrics),
      signalId: input.signal.id,
      rawItemId: input.rawItem.id,
      sourceItemId: input.rawItem.sourceItemId ?? null,
      metadata: {
        collectedAt: getString(rawMetadata.collectedAt) ?? null,
        topicWatchId: getString(rawMetadata.topicWatchId) ?? null,
      },
    };
  }
}

function normalizeMetrics(value: unknown): Record<string, number> {
  if (!isObject(value)) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      result[key] = raw;
      continue;
    }

    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        result[key] = parsed;
      }
    }
  }

  return result;
}

function compareSourceRows(a: KolRadarSourceRow, b: KolRadarSourceRow) {
  const viewsDiff = getMetricNumber(b.metrics, 'views', 'viewCount') - getMetricNumber(a.metrics, 'views', 'viewCount');
  if (viewsDiff !== 0) return viewsDiff;
  const aTime = a.observedAt.getTime();
  const bTime = b.observedAt.getTime();
  if (aTime !== bTime) return bTime - aTime;
  const likesDiff = getMetricNumber(b.metrics, 'likes', 'likeCount') - getMetricNumber(a.metrics, 'likes', 'likeCount');
  if (likesDiff !== 0) return likesDiff;
  return getMetricNumber(b.metrics, 'replies', 'replyCount', 'commentCount', 'comments') - getMetricNumber(a.metrics, 'replies', 'replyCount', 'commentCount', 'comments');
}

function getMetricNumber(metrics: Record<string, number>, ...keys: string[]) {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}

function getHandleFromTitle(title: string) {
  const [handle = 'unknown'] = title.split(/[：:]/);
  return handle;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonObjectValue(value: unknown, key: string): unknown {
  if (!isObject(value)) {
    return undefined;
  }
  return value[key];
}

function getIsoString(value: unknown, key: string): string | undefined {
  const raw = jsonObjectValue(value, key);
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function readNumberFromJson(value: unknown, key: string): number | undefined {
  const raw = jsonObjectValue(value, key);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

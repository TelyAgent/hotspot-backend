import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type OverviewRange = '7d' | '30d' | '1y';

interface MetricSnapshotLike {
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  views: number | null;
  isMissingData: boolean;
  errorMessage: string | null;
  observedAt: Date;
}

interface PublishedPostLike {
  id: string;
  contentTaskId: string;
  accountId: string | null;
  accountName: string | null;
  publishedAt: Date;
  trackingStatus: string;
  metricSnapshots: MetricSnapshotLike[];
}

interface EventLike {
  id: string;
  title: string;
  createdAt: Date;
  missingData: unknown;
  riskNotes: unknown;
  confidence: string;
  status: string;
}

@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(input: { range?: string; now?: Date }) {
    const range = this.normalizeRange(input.range);
    const now = input.now ?? new Date();
    const since = this.rangeStart(range, now);
    const posts = (await this.prisma.publishedPost.findMany({
      where: {
        publishedAt: {
          gte: since,
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      include: {
        metricSnapshots: {
          orderBy: {
            observedAt: 'desc',
          },
          take: 1,
        },
      },
    })) as unknown as PublishedPostLike[];
    const events = (await this.prisma.event.findMany({
      where: {
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })) as unknown as EventLike[];

    const rows = posts.map((post) => ({
      post,
      metric: post.metricSnapshots[0] ?? null,
    }));
    const totalLikes = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.likes), 0);
    const totalReplies = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.replies), 0);
    const totalReposts = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.reposts), 0);
    const totalQuotes = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.quotes), 0);
    const totalViews = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.views), 0);
    const totalInteractions = totalLikes + totalReplies + totalReposts + totalQuotes;
    const wellPerformingCount = rows.filter((row) => this.numberValue(row.metric?.views) >= 1000).length;
    const accountIds = new Set(rows.map((row) => this.accountIdFromPost(row.post)));

    return {
      range,
      stats: {
        wellPerformingRate: rows.length ? wellPerformingCount / rows.length : 0,
        wellPerformingCount,
        publishedCount: rows.length,
        totalViews,
        totalInteractions,
        publishedAccounts: accountIds.size,
        avgFirstPublishLatencyMs: this.averageFirstPublishLatency(rows, events),
      },
      trend: this.buildTrend(rows),
      accountPerformance: this.buildAccountPerformance(rows),
      manualItems: events
        .filter((event) => this.needsManualReview(event))
        .slice(0, 8)
        .map((event) => ({
          severity: event.confidence === 'low' ? 'critical' : 'warning',
          title: event.title,
          description: [
            ...this.stringArray(event.missingData),
            ...this.stringArray(event.riskNotes),
          ][0] ?? '事件需要人工复核。',
          eventId: event.id,
          actionPage: 'events',
        })),
      anomalies: this.buildAnomalies(rows),
    };
  }

  private buildTrend(
    rows: Array<{ post: PublishedPostLike; metric: MetricSnapshotLike | null }>,
  ) {
    const byDate = new Map<string, { date: string; views: number; interactions: number; publishedCount: number }>();

    for (const row of rows) {
      const date = row.post.publishedAt.toISOString().slice(0, 10);
      const existing = byDate.get(date) ?? {
        date,
        views: 0,
        interactions: 0,
        publishedCount: 0,
      };
      existing.views += this.numberValue(row.metric?.views);
      existing.interactions +=
        this.numberValue(row.metric?.likes) +
        this.numberValue(row.metric?.replies) +
        this.numberValue(row.metric?.reposts) +
        this.numberValue(row.metric?.quotes);
      existing.publishedCount += 1;
      byDate.set(date, existing);
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  private buildAccountPerformance(
    rows: Array<{ post: PublishedPostLike; metric: MetricSnapshotLike | null }>,
  ) {
    const groups = new Map<
      string,
      {
        accountId: string;
        name: string;
        rows: Array<{ post: PublishedPostLike; metric: MetricSnapshotLike | null }>;
      }
    >();

    for (const row of rows) {
      const accountId = this.accountIdFromPost(row.post);
      const existing = groups.get(accountId) ?? {
        accountId,
        name: this.accountNameFromPost(row.post),
        rows: [],
      };
      existing.rows.push(row);
      groups.set(accountId, existing);
    }

    return Array.from(groups.values())
      .map((group) => {
        const publishedCount = group.rows.length;
        const totalViews = group.rows.reduce((sum, row) => sum + this.numberValue(row.metric?.views), 0);
        const wellPerformingCount = group.rows.filter((row) => this.numberValue(row.metric?.views) >= 1000).length;
        const wellPerformingRate = publishedCount ? wellPerformingCount / publishedCount : 0;
        const avgViews = publishedCount ? totalViews / publishedCount : undefined;

        return {
          accountId: group.accountId,
          name: group.name,
          wellPerformingRate,
          avgViews,
          publishedCount,
          score: Math.min(100, Math.round(wellPerformingRate * 80 + Math.min((avgViews ?? 0) / 1000, 1) * 20)),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }

  private buildAnomalies(
    rows: Array<{ post: PublishedPostLike; metric: MetricSnapshotLike | null }>,
  ) {
    const trackingErrorCount = rows.filter(
      (row) =>
        row.post.trackingStatus === 'failed' ||
        row.metric?.isMissingData === true ||
        Boolean(row.metric?.errorMessage),
    ).length;

    return trackingErrorCount
      ? [
          {
            severity: 'critical',
            type: '追踪异常',
            count: trackingErrorCount,
            description: '存在发布帖追踪失败、数据缺失或接口错误。',
            actionPage: 'insights',
          },
        ]
      : [];
  }

  private averageFirstPublishLatency(
    rows: Array<{ post: PublishedPostLike }>,
    events: EventLike[],
  ): number | undefined {
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const latencies = rows
      .map((row) => {
        const eventId = this.eventIdFromContentTaskId(row.post.contentTaskId);
        const event = eventId ? eventsById.get(eventId) : undefined;
        return event ? row.post.publishedAt.getTime() - event.createdAt.getTime() : undefined;
      })
      .filter((value): value is number => typeof value === 'number' && value >= 0);

    return latencies.length
      ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      : undefined;
  }

  private needsManualReview(event: EventLike): boolean {
    return (
      event.confidence === 'low' ||
      this.stringArray(event.missingData).length > 0 ||
      this.stringArray(event.riskNotes).length > 0
    );
  }

  private normalizeRange(range?: string): OverviewRange {
    if (range === '30d' || range === '1y') return range;
    return '7d';
  }

  private rangeStart(range: OverviewRange, now: Date): Date {
    const days = range === '1y' ? 365 : range === '30d' ? 30 : 7;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private numberValue(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }

  private accountIdFromPost(post: PublishedPostLike): string {
    return post.accountId?.trim() || this.accountIdFromContentTaskId(post.contentTaskId);
  }

  private accountNameFromPost(post: PublishedPostLike): string {
    return post.accountName?.trim() || this.accountNameFromContentTaskId(post.contentTaskId);
  }

  private accountIdFromContentTaskId(contentTaskId: string): string {
    if (contentTaskId.startsWith('hotspot_operation:')) return 'hotspot-operation';
    return contentTaskId;
  }

  private accountNameFromContentTaskId(contentTaskId: string): string {
    if (contentTaskId.startsWith('hotspot_operation:')) return '热点运营';
    return contentTaskId;
  }

  private eventIdFromContentTaskId(contentTaskId: string): string {
    return contentTaskId.startsWith('hotspot_operation:')
      ? contentTaskId.replace('hotspot_operation:', '')
      : '';
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type InsightsRange = '7d' | '30d' | '1y';

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
  platform: string;
  url: string;
  publishedAt: Date;
  trackingStatus: string;
  metricSnapshots: MetricSnapshotLike[];
}

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInsights(input: { range?: string; now?: Date }) {
    const range = this.normalizeRange(input.range);
    const since = this.rangeStart(range, input.now ?? new Date());
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

    const rows = posts.map((post) => ({
      post,
      metric: post.metricSnapshots[0] ?? null,
    }));

    const totalLikes = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.likes), 0);
    const totalReplies = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.replies), 0);
    const totalReposts = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.reposts), 0);
    const totalQuotes = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.quotes), 0);
    const totalViews = rows.reduce((sum, row) => sum + this.numberValue(row.metric?.views), 0);
    const wellPerformingCount = rows.filter((row) => this.numberValue(row.metric?.views) >= 1000).length;
    const trackingErrorRows = rows.filter((row) => this.isTrackingIssue(row.post, row.metric));
    const accountGroups = this.groupByAccount(rows);

    return {
      range,
      stats: {
        trackingPosts: rows.filter((row) =>
          ['active', 'extended', 'pending'].includes(row.post.trackingStatus),
        ).length,
        wellPerformingRate: rows.length ? wellPerformingCount / rows.length : 0,
        avgInteractionRate: totalViews > 0
          ? (totalLikes + totalReplies + totalReposts + totalQuotes) / totalViews
          : 0,
        totalLikes,
        totalReplies,
        totalReposts,
        totalQuotes,
        totalViews,
        trackingErrorPosts: trackingErrorRows.length,
      },
      accounts: Array.from(accountGroups.values())
        .map((group) => this.toAccountInsight(group))
        .sort((a, b) => b.publishedPosts - a.publishedPosts),
      trackingIssues: trackingErrorRows.map(({ post, metric }) => ({
        publicationRecordId: post.id,
        taskId: post.contentTaskId,
        eventId: this.eventIdFromContentTaskId(post.contentTaskId),
        accountId: this.accountIdFromPost(post),
        accountName: this.accountNameFromPost(post),
        url: post.url,
        trackingStatus: post.trackingStatus,
        lastTrackingError:
          metric?.errorMessage ??
          (metric?.isMissingData ? '数据缺失' : '追踪状态异常'),
        lastTrackingErrorAt: (metric?.observedAt ?? post.publishedAt).toISOString(),
        trackingFailureCount: 1,
      })),
    };
  }

  private groupByAccount(
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

    return groups;
  }

  private toAccountInsight(group: {
    accountId: string;
    name: string;
    rows: Array<{ metric: MetricSnapshotLike | null }>;
  }) {
    const publishedPosts = group.rows.length;
    const totalViews = group.rows.reduce((sum, row) => sum + this.numberValue(row.metric?.views), 0);
    const totalLikes = group.rows.reduce((sum, row) => sum + this.numberValue(row.metric?.likes), 0);
    const totalReplies = group.rows.reduce((sum, row) => sum + this.numberValue(row.metric?.replies), 0);
    const totalReposts = group.rows.reduce((sum, row) => sum + this.numberValue(row.metric?.reposts), 0);
    const wellPerforming = group.rows.filter((row) => this.numberValue(row.metric?.views) >= 1000).length;

    return {
      accountId: group.accountId,
      name: group.name,
      publishedPosts,
      avgViews: publishedPosts ? totalViews / publishedPosts : undefined,
      avgLikes: publishedPosts ? totalLikes / publishedPosts : 0,
      avgReplies: publishedPosts ? totalReplies / publishedPosts : 0,
      avgReposts: publishedPosts ? totalReposts / publishedPosts : 0,
      wellPerformingRate: publishedPosts ? wellPerforming / publishedPosts : 0,
    };
  }

  private isTrackingIssue(post: PublishedPostLike, metric: MetricSnapshotLike | null): boolean {
    return (
      post.trackingStatus === 'failed' ||
      metric?.isMissingData === true ||
      Boolean(metric?.errorMessage)
    );
  }

  private normalizeRange(range?: string): InsightsRange {
    if (range === '30d' || range === '1y') return range;
    return '7d';
  }

  private rangeStart(range: InsightsRange, now: Date): Date {
    const days = range === '1y' ? 365 : range === '30d' ? 30 : 7;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private numberValue(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private accountIdFromContentTaskId(contentTaskId: string): string {
    if (contentTaskId.startsWith('hotspot_operation:')) return 'hotspot-operation';
    return contentTaskId;
  }

  private accountNameFromContentTaskId(contentTaskId: string): string {
    if (contentTaskId.startsWith('hotspot_operation:')) return '热点运营';
    return contentTaskId;
  }

  private accountIdFromPost(post: PublishedPostLike): string {
    return post.accountId?.trim() || this.accountIdFromContentTaskId(post.contentTaskId);
  }

  private accountNameFromPost(post: PublishedPostLike): string {
    return post.accountName?.trim() || this.accountNameFromContentTaskId(post.contentTaskId);
  }

  private eventIdFromContentTaskId(contentTaskId: string): string {
    return contentTaskId.startsWith('hotspot_operation:')
      ? contentTaskId.replace('hotspot_operation:', '')
      : '';
  }
}

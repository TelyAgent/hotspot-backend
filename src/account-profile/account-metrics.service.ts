import { Injectable, Logger } from '@nestjs/common';
import { AccountProfileRepository } from './account-profile.repository';
import {
  AuthorEngagementWindow,
  EngagementRefreshResult,
  PostSignalRow,
  normalizeHandle,
} from './account-profile.types';

export const DEFAULT_WINDOW_DAYS = 7;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 30;

/** observedAt 粗筛的回溯天数，必须 >= MAX_WINDOW_DAYS */
const SCAN_BUFFER_DAYS = 30;
const MAX_SCAN_SIGNALS = 20_000;
/** 容忍客户端/服务端时钟偏差 */
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AggregatePostSignalsOptions {
  windowStart: Date;
  now: Date;
  includeReposts?: boolean;
}

export interface AggregatePostSignalsResult {
  authors: AuthorEngagementWindow[];
  matchedSignals: number;
}

interface AuthorBucket {
  handle: string;
  displayHandle: string | null;
  displayName: string | null;
  twitterUserId: string | null;
  postIds: Set<string>;
  commentsSum: number;
  commentsCount: number;
  repostsSum: number;
  repostsCount: number;
  viewsSum: number;
  viewsCount: number;
  likesSum: number;
  likesCount: number;
  lastActiveAt: Date | null;
}

/**
 * 纯函数：把一批 x_post signal 按作者聚合成「近 N 天互动指标」。
 *
 * 口径说明：
 * - 时间窗口按 metadata.publishedAt（帖子真实发布时间）判断，不是 observedAt。
 * - 同一 postId 只计一次（防止重复采集导致均值被稀释）。
 * - metrics 键名沿用 x-account-posts 插件落库的值：views / likes / reposts / replies。
 *   其中 replies → 前端的「评论」，reposts → 前端的「转发」。
 * - 默认排除转发帖（postType='repost'），因为转发不代表原创产能。
 */
export function aggregatePostSignals(
  rows: PostSignalRow[],
  options: AggregatePostSignalsOptions,
): AggregatePostSignalsResult {
  const { windowStart, now } = options;
  const includeReposts = options.includeReposts ?? false;
  const windowStartMs = windowStart.getTime();
  const upperBoundMs = now.getTime() + FUTURE_TOLERANCE_MS;
  const buckets = new Map<string, AuthorBucket>();
  let matchedSignals = 0;

  for (const row of rows) {
    const metadata = asRecord(row.metadata);
    if (!metadata) {
      continue;
    }

    const handle = normalizeHandle(readString(metadata, 'authorHandle') ?? '');
    if (!handle) {
      continue;
    }

    const postType = readString(metadata, 'postType');
    if (!includeReposts && postType === 'repost') {
      continue;
    }

    const publishedAt = parseDate(readString(metadata, 'publishedAt'));
    if (!publishedAt) {
      continue;
    }

    const publishedMs = publishedAt.getTime();
    if (publishedMs < windowStartMs || publishedMs > upperBoundMs) {
      continue;
    }

    let bucket = buckets.get(handle);
    if (!bucket) {
      bucket = {
        handle,
        displayHandle: null,
        displayName: null,
        twitterUserId: null,
        postIds: new Set<string>(),
        commentsSum: 0,
        commentsCount: 0,
        repostsSum: 0,
        repostsCount: 0,
        viewsSum: 0,
        viewsCount: 0,
        likesSum: 0,
        likesCount: 0,
        lastActiveAt: null,
      };
      buckets.set(handle, bucket);
    }

    const postId = readString(metadata, 'postId');
    if (postId) {
      if (bucket.postIds.has(postId)) {
        continue;
      }
      bucket.postIds.add(postId);
    }

    matchedSignals += 1;

    if (!bucket.displayHandle) {
      const rawHandle = readString(metadata, 'authorHandle');
      bucket.displayHandle = rawHandle ? rawHandle.replace(/^@/, '') : handle;
    }
    if (!bucket.displayName) {
      bucket.displayName = readString(metadata, 'authorName');
    }
    if (!bucket.twitterUserId) {
      bucket.twitterUserId = readString(metadata, 'authorId');
    }

    const metrics = asRecord(row.metrics);
    accumulate(bucket, 'comments', readNumber(metrics, 'replies'));
    accumulate(bucket, 'reposts', readNumber(metrics, 'reposts'));
    accumulate(bucket, 'views', readNumber(metrics, 'views'));
    accumulate(bucket, 'likes', readNumber(metrics, 'likes'));

    if (!bucket.lastActiveAt || publishedAt > bucket.lastActiveAt) {
      bucket.lastActiveAt = publishedAt;
    }
  }

  const authors: AuthorEngagementWindow[] = [];
  for (const bucket of buckets.values()) {
    authors.push({
      handle: bucket.handle,
      displayHandle: bucket.displayHandle ?? bucket.handle,
      displayName: bucket.displayName,
      twitterUserId: bucket.twitterUserId,
      weeklyPosts: bucket.postIds.size,
      avgComments: average(bucket.commentsSum, bucket.commentsCount),
      avgReposts: average(bucket.repostsSum, bucket.repostsCount),
      avgViews: average(bucket.viewsSum, bucket.viewsCount),
      avgLikes: average(bucket.likesSum, bucket.likesCount),
      lastActiveAt: bucket.lastActiveAt,
    });
  }

  authors.sort((left, right) => left.handle.localeCompare(right.handle));
  return { authors, matchedSignals };
}

function accumulate(
  bucket: AuthorBucket,
  key: 'comments' | 'reposts' | 'views' | 'likes',
  value: number | null,
) {
  if (value == null) {
    return;
  }

  if (key === 'comments') {
    bucket.commentsSum += value;
    bucket.commentsCount += 1;
  } else if (key === 'reposts') {
    bucket.repostsSum += value;
    bucket.repostsCount += 1;
  } else if (key === 'views') {
    bucket.viewsSum += value;
    bucket.viewsCount += 1;
  } else {
    bucket.likesSum += value;
    bucket.likesCount += 1;
  }
}

@Injectable()
export class AccountMetricsService {
  private readonly logger = new Logger(AccountMetricsService.name);

  constructor(private readonly repository: AccountProfileRepository) {}

  async refreshEngagement(
    options: { windowDays?: number; now?: Date } = {},
  ): Promise<EngagementRefreshResult> {
    const now = options.now ?? new Date();
    const windowDays = clampWindowDays(options.windowDays ?? DEFAULT_WINDOW_DAYS);
    const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
    const scanStart = new Date(now.getTime() - Math.max(SCAN_BUFFER_DAYS, windowDays) * DAY_MS);

    const rows = await this.repository.findPostSignalsSince(scanStart, MAX_SCAN_SIGNALS);
    const { authors, matchedSignals } = aggregatePostSignals(rows, { windowStart, now });

    const handles = authors.map((author) => author.handle);
    const tombstones = new Set(await this.repository.listTombstoneHandles());
    const knownRows = await this.repository.findManyByHandles(handles);
    const known = new Map(knownRows.map((row) => [row.handle, row]));

    let updated = 0;
    let created = 0;
    let skippedTombstoned = 0;

    for (const author of authors) {
      // 硬删过的 handle 不允许被自动发现重新插回账号池
      if (tombstones.has(author.handle)) {
        skippedTombstoned += 1;
        continue;
      }

      const existing = known.get(author.handle);

      if (existing) {
        await this.repository.update(author.handle, {
          weeklyPosts: author.weeklyPosts,
          avgComments: author.avgComments,
          avgReposts: author.avgReposts,
          avgViews: author.avgViews,
          avgLikes: author.avgLikes,
          lastActiveAt: author.lastActiveAt,
          lastAggregatedAt: now,
          isActive: true,
          // 帖子里的作者名只作兜底，不覆盖人工维护的静态资料
          displayName: existing.displayName ?? author.displayName,
          twitterUserId: existing.twitterUserId ?? author.twitterUserId,
        });
        updated += 1;
        continue;
      }

      await this.repository.create({
        handle: author.handle,
        displayHandle: author.displayHandle,
        displayName: author.displayName,
        twitterUserId: author.twitterUserId,
        weeklyPosts: author.weeklyPosts,
        avgComments: author.avgComments,
        avgReposts: author.avgReposts,
        avgViews: author.avgViews,
        avgLikes: author.avgLikes,
        lastActiveAt: author.lastActiveAt,
        lastAggregatedAt: now,
        // 自动发现的账号只进筛选账号池，不进 KOL 雷达采集名单
        monitorEnabled: false,
        source: 'discovered',
        isActive: true,
      });
      created += 1;
    }

    const resetStale = await this.repository.resetStaleEngagement({
      activeBefore: windowStart,
      aggregatedAt: now,
    });

    this.logger.log(
      `Account engagement refreshed: window=${windowDays}d, scanned=${rows.length}, matched=${matchedSignals}, updated=${updated}, created=${created}, resetStale=${resetStale}`,
    );

    return {
      windowDays,
      windowStart: windowStart.toISOString(),
      scannedSignals: rows.length,
      matchedSignals,
      authors: authors.length,
      updated,
      created,
      skippedTombstoned,
      resetStale,
      finishedAt: now.toISOString(),
    };
  }
}

function clampWindowDays(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WINDOW_DAYS;
  }
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.floor(value)));
}

function average(sum: number, count: number): number | null {
  if (count === 0) {
    return null;
  }
  return Math.round((sum / count) * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  if (!source) {
    return null;
  }

  const value = source[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(source: Record<string, unknown> | null, key: string): number | null {
  if (!source) {
    return null;
  }

  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

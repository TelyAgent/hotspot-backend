import { Injectable } from '@nestjs/common';
import { JsonValue } from '../../common/types/json.type';
import { Signal } from '../../signal/signal/signal.types';
import { TopicWatchRepository } from '../topic-watch.repository';

export interface TopicWatchPostLeaderboardInput {
  topicWatchId: string;
  topicWatchName: string;
  observedAt?: Date;
  limit?: number;
}

export interface TopicWatchPostLeaderboardItem {
  rank: number;
  signalId: string;
  postId: string;
  topicWatchId: string;
  topicWatchName: string;
  authorHandle: string;
  authorName: string | null;
  text: string;
  url: string | null;
  postType: string | null;
  publishedAt: string;
  firstObservedAt: string;
  lastObservedAt: string;
  metrics: {
    views?: number;
    likes?: number;
    replies?: number;
    reposts?: number;
    quotes?: number;
  };
  deltaViews: number | null;
  previousRank: number | null;
  status: 'hot_event_candidate' | 'watching';
}

export interface TopicWatchPostLeaderboard {
  topicWatchId: string;
  topicWatchName: string;
  calculatedAt: string;
  windowStartAt: string;
  windowEndAt: string;
  items: TopicWatchPostLeaderboardItem[];
}

interface PostSnapshot {
  signal: Signal;
  postId: string;
  postKey: string;
  authorHandle: string;
  authorName: string | null;
  text: string;
  url: string | null;
  postType: string | null;
  publishedAt: string;
  metrics: TopicWatchPostLeaderboardItem['metrics'];
}

@Injectable()
export class TopicWatchPostLeaderboardService {
  constructor(private readonly topicWatchRepository: TopicWatchRepository) {}

  async getTopicLeaderboard(
    input: TopicWatchPostLeaderboardInput,
  ): Promise<TopicWatchPostLeaderboard> {
    let windowEndAt = input.observedAt ?? new Date();
    let windowStartAt = createWindowStartAt(windowEndAt);
    let signals = await this.topicWatchRepository.listSignalsForTopicWatch({
      topicWatchId: input.topicWatchId,
      windowStartAt,
      windowEndAt,
    });
    if (signals.length === 0) {
      const latestSignals = await this.topicWatchRepository.listSignalsForTopicWatch({
        topicWatchId: input.topicWatchId,
        windowStartAt: new Date(windowEndAt.getTime() - 30 * 24 * 60 * 60 * 1000),
        windowEndAt,
      });
      const latestObservedAt = latestSignals
        .map((signal) => signal.observedAt)
        .sort((left, right) => right.getTime() - left.getTime())[0];

      if (latestObservedAt) {
        windowEndAt = latestObservedAt;
        windowStartAt = createWindowStartAt(windowEndAt);
        signals = await this.topicWatchRepository.listSignalsForTopicWatch({
          topicWatchId: input.topicWatchId,
          windowStartAt,
          windowEndAt,
        });
      }
    }
    const latestPosts = uniqueLatestPosts(signals.map(toPostSnapshot));
    const items = latestPosts
      .sort(comparePostSnapshot)
      .slice(0, input.limit ?? 10)
      .map((post, index) => toLeaderboardItem(post, input, index + 1));

    return {
      topicWatchId: input.topicWatchId,
      topicWatchName: input.topicWatchName,
      calculatedAt: windowEndAt.toISOString(),
      windowStartAt: windowStartAt.toISOString(),
      windowEndAt: windowEndAt.toISOString(),
      items,
    };
  }
}

function createWindowStartAt(windowEndAt: Date) {
  return new Date(windowEndAt.getTime() - 24 * 60 * 60 * 1000);
}

function toPostSnapshot(signal: Signal): PostSnapshot {
  const metadata = toObject(signal.metadata);
  const metrics = toMetricObject(signal.metrics);
  const authorHandle =
    getString(metadata.authorHandle) ?? firstString(metadata.authorHandles) ?? 'unknown';
  const postId =
    getString(metadata.postId) ??
    getString(metadata.sourceItemId) ??
    signal.id;
  const url = getString(metadata.url) ?? null;

  return {
    signal,
    postId,
    postKey: getPostKey(postId, url, authorHandle, signal.summary ?? signal.title),
    authorHandle,
    authorName: getString(metadata.authorName) ?? null,
    text: signal.summary ?? signal.title,
    url,
    postType: getString(metadata.postType) ?? null,
    publishedAt: getString(metadata.publishedAt) ?? signal.observedAt.toISOString(),
    metrics,
  };
}

function uniqueLatestPosts(posts: PostSnapshot[]) {
  const latestByPostKey = new Map<string, PostSnapshot>();

  for (const post of posts) {
    const current = latestByPostKey.get(post.postKey);
    if (!current || post.signal.observedAt.getTime() >= current.signal.observedAt.getTime()) {
      latestByPostKey.set(post.postKey, post);
    }
  }

  return [...latestByPostKey.values()];
}

function comparePostSnapshot(left: PostSnapshot, right: PostSnapshot) {
  const viewDelta = getNumber(right.metrics.views) - getNumber(left.metrics.views);
  if (viewDelta !== 0) return viewDelta;
  return right.signal.observedAt.getTime() - left.signal.observedAt.getTime();
}

function toLeaderboardItem(
  post: PostSnapshot,
  input: TopicWatchPostLeaderboardInput,
  rank: number,
): TopicWatchPostLeaderboardItem {
  return {
    rank,
    signalId: post.signal.id,
    postId: post.postId,
    topicWatchId: input.topicWatchId,
    topicWatchName: input.topicWatchName,
    authorHandle: post.authorHandle,
    authorName: post.authorName,
    text: post.text,
    url: post.url,
    postType: post.postType,
    publishedAt: post.publishedAt,
    firstObservedAt: post.signal.createdAt.toISOString(),
    lastObservedAt: post.signal.observedAt.toISOString(),
    metrics: post.metrics,
    deltaViews: null,
    previousRank: null,
    status: rank <= 10 ? 'watching' : 'watching',
  };
}

function getPostKey(
  postId: string,
  url: string | null,
  authorHandle: string,
  text: string,
) {
  if (postId && postId !== 'unknown') return `post:${postId}`;
  if (url) return `url:${url}`;
  return `text:${authorHandle}:${text}`;
}

function toObject(value: JsonValue | undefined | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toMetricObject(value: JsonValue | undefined | null) {
  const raw = toObject(value);
  return {
    views: getOptionalNumber(raw.views),
    likes: getOptionalNumber(raw.likes),
    replies: getOptionalNumber(raw.replies),
    reposts: getOptionalNumber(raw.reposts),
    quotes: getOptionalNumber(raw.quotes),
  };
}

function getOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstString(value: unknown) {
  return Array.isArray(value) && typeof value[0] === 'string'
    ? value[0].trim()
    : undefined;
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../../common/types/json.type';
import {
  DataSourceCollectInput,
  DataSourceCollectResult,
  DataSourceNormalizeInput,
  DataSourceNormalizeResult,
  DataSourcePlugin,
} from '../data-source-plugin.interface';

type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<Response>;

interface TwitterApiIoUserInfoResponse {
  status?: 'success' | 'error';
  msg?: string;
  message?: string;
  data?: {
    id?: string;
    userName?: string;
    name?: string;
  };
}

interface TwitterApiIoTimelineTweet {
  type?: string;
  id?: string;
  url?: string;
  text?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  createdAt?: string;
  isReply?: boolean;
  inReplyToId?: string;
  retweeted_tweet?: unknown;
  quoted_tweet?: unknown;
  author?: {
    id?: string;
    userName?: string;
    name?: string;
  };
}

interface TwitterApiIoTimelineResponse {
  status?: 'success' | 'error';
  msg?: string;
  message?: string;
  tweets?: TwitterApiIoTimelineTweet[];
  data?: TwitterApiIoTimelineTweet[] | { tweets?: TwitterApiIoTimelineTweet[] };
  has_next_page?: boolean;
  next_cursor?: string;
}

type XAccountPostPayload = JsonObject & {
  postId: string;
  authorHandle: string;
  authorId: string | null;
  authorName: string | null;
  text: string;
  url: string | null;
  postType: 'original' | 'quote' | 'reply' | 'repost';
  replyToPostId: string | null;
  repostedPostId: string | null;
  quotedPostId: string | null;
  publishedAt: string;
  metrics: JsonObject;
  raw: JsonValue;
};

const DEFAULT_BASE_URL = 'https://api.twitterapi.io';

@Injectable()
export class XAccountPostsPlugin implements DataSourcePlugin {
  readonly id = 'x-account-posts';
  readonly name = 'X 账号帖子采集';
  readonly platform = 'x';
  readonly capabilities = [
    {
      id: 'x.account.posts',
      name: '采集 X 账号帖子',
      description: '通过 twitterapi.io 拉取指定 X/Twitter 账号时间线，并标准化为帖子 Signal。',
      defaultLimit: 50,
      inputSchema: {
        type: 'object',
        properties: {
          handle: {
            type: 'string',
            description: 'X/Twitter 账号 handle，可带 @。',
          },
          topicWatchId: {
            type: 'string',
            description: '来源重点主题 ID，用于后续聚合归属。',
          },
          since: {
            type: 'string',
            description: '采集窗口开始时间 ISO 字符串。',
          },
          until: {
            type: 'string',
            description: '采集窗口结束时间 ISO 字符串。',
          },
          maxPages: {
            type: 'number',
            description: '最多翻页数，默认 5。',
          },
          includeReplies: {
            type: 'boolean',
            description: '是否包含回复，默认 true。',
          },
          includeQuotes: {
            type: 'boolean',
            description: '是否保留引用帖，默认 true。',
          },
          includeReposts: {
            type: 'boolean',
            description: '是否保留转发，默认 false。',
          },
        },
      },
    },
  ];

  constructor(private readonly configService: ConfigService) {}

  async collect(
    input: DataSourceCollectInput,
  ): Promise<DataSourceCollectResult> {
    const apiKey = this.configService.get<string>('TWITTERAPI_IO_KEY');

    if (!apiKey) {
      throw new DomainError(
        'TWITTERAPI_IO_KEY is required for x.account.posts.',
        'TWITTERAPI_IO_KEY_NOT_CONFIGURED',
      );
    }

    const fetcher = globalThis.fetch as Fetcher | undefined;
    if (!fetcher) {
      throw new DomainError(
        'fetch is not available in this runtime.',
        'FETCH_NOT_AVAILABLE',
      );
    }

    const handle = normalizeHandle(getRequiredString(input.params.handle, 'handle'));
    const baseUrl = (
      this.configService.get<string>('TWITTERAPI_BASE_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/$/, '');
    const collectedAt = input.context.observedAt.toISOString();
    const sinceTime = input.params.since
      ? new Date(String(input.params.since)).getTime()
      : Number.NEGATIVE_INFINITY;
    const untilTime = input.params.until
      ? new Date(String(input.params.until)).getTime()
      : Number.POSITIVE_INFINITY;
    const maxPages = Math.max(1, getNumber(input.params.maxPages, 5));
    const includeReplies = getBoolean(input.params.includeReplies, true);
    const includeQuotes = getBoolean(input.params.includeQuotes, true);
    const includeReposts = getBoolean(input.params.includeReposts, false);
    const topicWatchId = getString(input.params.topicWatchId);

    const user = await this.fetchUserInfo({ handle, baseUrl, apiKey, fetcher });
    const posts: XAccountPostPayload[] = [];
    let cursor = '';

    for (let page = 0; page < maxPages; page += 1) {
      const timeline = await this.fetchTimelinePage({
        userId: user.id,
        cursor,
        includeReplies,
        baseUrl,
        apiKey,
        fetcher,
      });
      const tweets = extractTweets(timeline);
      if (tweets.length === 0) break;

      let reachedOlderPost = false;
      for (const tweet of tweets) {
        const publishedAt = tweet.createdAt
          ? new Date(tweet.createdAt).getTime()
          : input.context.observedAt.getTime();
        if (publishedAt > untilTime) continue;
        if (publishedAt < sinceTime) {
          reachedOlderPost = true;
          continue;
        }

        const post = mapTimelineTweet(tweet, handle, input.context.observedAt);
        if (!includeReposts && post.postType === 'repost') continue;
        if (!includeQuotes && post.postType === 'quote') continue;
        if (!post.text.trim()) continue;
        posts.push(post);
      }

      if (reachedOlderPost || !timeline.has_next_page || !timeline.next_cursor) {
        break;
      }
      cursor = timeline.next_cursor;
    }

    return {
      rawItems: posts.map((post) => ({
        source: this.platform,
        sourceType: 'x_account_post',
        sourceItemId: post.postId,
        observedAt: input.context.observedAt,
        payload: post,
        metadata: {
          pluginId: this.id,
          capabilityId: input.capabilityId,
          handle,
          topicWatchId: topicWatchId ?? null,
          collectedAt,
        },
      })),
      summary: {
        handle,
        topicWatchId: topicWatchId ?? null,
        collectedAt,
        count: posts.length,
        nextCursor: cursor || null,
      },
    };
  }

  async normalize(
    input: DataSourceNormalizeInput,
  ): Promise<DataSourceNormalizeResult | null> {
    if (!isJsonObject(input.rawItem.payload)) {
      return null;
    }

    const item = input.rawItem.payload as XAccountPostPayload;
    const handle =
      getString(item.authorHandle) ??
      getMetadataString(input.rawItem.metadata, 'handle') ??
      'unknown';
    const text = getString(item.text) ?? '';
    const title = `${handle}：${truncateText(text, 80)}`;
    const metrics = isJsonObject(item.metrics) ? item.metrics : {};
    const topicWatchId = getMetadataString(input.rawItem.metadata, 'topicWatchId');

    return {
      signal: {
        signalType: 'x_post',
        title,
        summary: text,
        platform: this.platform,
        metrics,
        metadata: {
          topicWatchId: topicWatchId ?? null,
          postId: item.postId,
          authorHandles: [handle],
          authorHandle: handle,
          authorName: getString(item.authorName) ?? null,
          postType: item.postType,
          publishedAt: item.publishedAt,
          url: getString(item.url) ?? null,
          sourceItemId: input.rawItem.sourceItemId ?? null,
        },
      },
      evidence: [
        {
          claim: `${handle} 发布了帖子：${truncateText(text, 120)}`,
          sourceType: 'x_account_post',
          sourceItemId: input.rawItem.sourceItemId,
          text,
          url: getString(item.url),
          metrics,
          confidence: 'high',
          metadata: {
            topicWatchId: topicWatchId ?? null,
            postId: item.postId,
            authorHandle: handle,
            authorName: getString(item.authorName) ?? null,
            postType: item.postType,
            publishedAt: item.publishedAt,
          },
        },
      ],
    };
  }

  private async fetchUserInfo(input: {
    handle: string;
    baseUrl: string;
    apiKey: string;
    fetcher: Fetcher;
  }) {
    const url = `${input.baseUrl}/twitter/user/info?userName=${encodeURIComponent(input.handle)}`;
    const response = await input.fetcher(url, {
      headers: { 'X-API-Key': input.apiKey },
    });
    const body = (await response.json()) as TwitterApiIoUserInfoResponse;

    if (!response.ok || body.status === 'error') {
      throw new Error(
        body.msg ??
          body.message ??
          `${response.status} ${response.statusText}`.trim(),
      );
    }
    if (!body.data?.id) {
      throw new Error(`twitterapi.io user info returned no id for ${input.handle}`);
    }

    return {
      id: body.data.id,
      userName: body.data.userName ?? input.handle,
      name: body.data.name,
    };
  }

  private async fetchTimelinePage(input: {
    userId: string;
    cursor: string;
    includeReplies: boolean;
    baseUrl: string;
    apiKey: string;
    fetcher: Fetcher;
  }) {
    const params = new URLSearchParams({
      userId: input.userId,
      includeReplies: String(input.includeReplies),
    });
    if (input.cursor) {
      params.set('cursor', input.cursor);
    }

    const url = `${input.baseUrl}/twitter/user/tweet_timeline?${params.toString()}`;
    const response = await input.fetcher(url, {
      headers: { 'X-API-Key': input.apiKey },
    });
    const body = (await response.json()) as TwitterApiIoTimelineResponse;

    if (!response.ok || body.status === 'error') {
      throw new Error(
        body.msg ??
          body.message ??
          `${response.status} ${response.statusText}`.trim(),
      );
    }

    return body;
  }
}

function extractTweets(body: TwitterApiIoTimelineResponse) {
  if (Array.isArray(body.tweets)) return body.tweets;
  if (Array.isArray(body.data)) return body.data;
  if (body.data && !Array.isArray(body.data) && Array.isArray(body.data.tweets)) {
    return body.data.tweets;
  }
  return [];
}

function mapTimelineTweet(
  tweet: TwitterApiIoTimelineTweet,
  fallbackHandle: string,
  observedAt: Date,
): XAccountPostPayload {
  const authorHandle = tweet.author?.userName ?? fallbackHandle;
  const postId = tweet.id ?? `missing-${fallbackHandle}-${tweet.createdAt ?? observedAt.toISOString()}`;

  return {
    postId,
    authorHandle,
    authorId: tweet.author?.id ?? null,
    authorName: tweet.author?.name ?? null,
    text: tweet.text ?? '',
    url: tweet.url ?? null,
    postType: resolvePostType(tweet),
    replyToPostId: tweet.inReplyToId ?? null,
    repostedPostId: tweet.retweeted_tweet
      ? String((tweet.retweeted_tweet as { id?: unknown }).id ?? '') || null
      : null,
    quotedPostId: tweet.quoted_tweet
      ? String((tweet.quoted_tweet as { id?: unknown }).id ?? '') || null
      : null,
    publishedAt: tweet.createdAt ?? observedAt.toISOString(),
    metrics: {
      views: tweet.viewCount ?? null,
      likes: tweet.likeCount ?? null,
      reposts: tweet.retweetCount ?? null,
      replies: tweet.replyCount ?? null,
      quotes: tweet.quoteCount ?? null,
      bookmarks: tweet.bookmarkCount ?? null,
    },
    raw: tweet as unknown as JsonValue,
  };
}

function resolvePostType(
  tweet: TwitterApiIoTimelineTweet,
): XAccountPostPayload['postType'] {
  if (tweet.retweeted_tweet) return 'repost';
  if (tweet.quoted_tweet) return 'quote';
  if (tweet.isReply || tweet.inReplyToId) return 'reply';
  return 'original';
}

function getRequiredString(value: unknown, key: string) {
  const text = getString(value);
  if (!text) {
    throw new DomainError(`${key} is required.`, 'INVALID_DATA_SOURCE_PARAMS');
  }
  return text;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function getMetadataString(metadata: unknown, key: string) {
  if (!isJsonObject(metadata)) return undefined;
  return getString(metadata[key]);
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

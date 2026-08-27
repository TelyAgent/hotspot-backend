import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  SignalEvidenceEnricher,
  SignalEvidenceEnricherInput,
} from './signal-evidence-enrichment.types';

type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<Response>;

interface TwitterApiIoSearchResponse {
  status?: 'success' | 'error';
  msg?: string;
  message?: string;
  tweets?: TwitterApiIoTweet[];
  data?: TwitterApiIoTweet[] | { tweets?: TwitterApiIoTweet[] };
}

interface TwitterApiIoTweet {
  id?: string;
  url?: string;
  text?: string;
  createdAt?: string;
  viewCount?: number;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
  author?: {
    userName?: string;
    name?: string;
  };
}

const DEFAULT_BASE_URL = 'https://api.twitterapi.io';
const DEFAULT_LIMIT = 3;

@Injectable()
export class XTrendEvidenceEnricher implements SignalEvidenceEnricher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  supports(signalType: string): boolean {
    return signalType === 'x_trend';
  }

  async enrich(input: SignalEvidenceEnricherInput): Promise<void> {
    const apiKey = this.configService.get<string>('TWITTERAPI_IO_KEY');
    const fetcher = globalThis.fetch as Fetcher | undefined;
    const query = getMetadataString(input.signal.metadata, 'query') ?? input.signal.title;
    if (!apiKey || !fetcher || !query.trim()) {
      return;
    }

    const baseUrl = (
      this.configService.get<string>('TWITTERAPI_BASE_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/$/, '');
    const limit = Math.max(1, Math.min(input.maxEvidence ?? DEFAULT_LIMIT, DEFAULT_LIMIT));
    const tweets = await this.fetchTopTweets({
      baseUrl,
      apiKey,
      fetcher,
      query,
    });

    for (const tweet of tweets.slice(0, limit)) {
      const postId = getString(tweet.id);
      const text = getString(tweet.text);
      if (!postId || !text) {
        continue;
      }

      await this.upsertEvidence({
        signalId: input.signal.id,
        query,
        tweet,
        postId,
        text,
      });
    }
  }

  private async fetchTopTweets(input: {
    baseUrl: string;
    apiKey: string;
    fetcher: Fetcher;
    query: string;
  }): Promise<TwitterApiIoTweet[]> {
    const params = new URLSearchParams();
    params.set('query', input.query);
    params.set('queryType', 'Top');
    const response = await input.fetcher(
      `${input.baseUrl}/twitter/tweet/advanced_search?${params.toString()}`,
      {
        headers: {
          'X-API-Key': input.apiKey,
        },
      },
    );
    const body = (await response.json()) as TwitterApiIoSearchResponse;
    if (!response.ok || body.status === 'error') {
      return [];
    }

    return extractTweets(body);
  }

  private async upsertEvidence(input: {
    signalId: string;
    query: string;
    tweet: TwitterApiIoTweet;
    postId: string;
    text: string;
  }) {
    const author = getString(input.tweet.author?.userName);
    const existing = await this.prisma.evidenceItem.findFirst({
      where: {
        signalId: input.signalId,
        sourceType: 'x_trend_related_post',
        sourceItemId: input.postId,
      },
    });
    const data = {
      signalId: input.signalId,
      sourceType: 'x_trend_related_post',
      sourceItemId: input.postId,
      claim: `X 搜索 Top 帖提到「${input.query}」相关讨论。`,
      text: input.text,
      url: getString(input.tweet.url),
      author,
      publishedAt: parseDate(input.tweet.createdAt),
      observedAt: new Date(),
      metrics: {
        views: input.tweet.viewCount ?? null,
        likes: input.tweet.likeCount ?? null,
        reposts: input.tweet.retweetCount ?? null,
        replies: input.tweet.replyCount ?? null,
        quotes: input.tweet.quoteCount ?? null,
        bookmarks: input.tweet.bookmarkCount ?? null,
      } satisfies Prisma.InputJsonObject,
      confidence: 'medium',
      metadata: {
        query: input.query,
        authorName: input.tweet.author?.name ?? null,
      } satisfies Prisma.InputJsonObject,
    };

    if (existing) {
      await this.prisma.evidenceItem.update({
        where: {
          id: existing.id,
        },
        data,
      });
      return;
    }

    await this.prisma.evidenceItem.create({
      data,
    });
  }
}

function extractTweets(body: TwitterApiIoSearchResponse): TwitterApiIoTweet[] {
  if (Array.isArray(body.tweets)) return body.tweets;
  if (Array.isArray(body.data)) return body.data;
  if (body.data && !Array.isArray(body.data) && Array.isArray(body.data.tweets)) {
    return body.data.tweets;
  }
  return [];
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return getString((metadata as Record<string, unknown>)[key]);
}

function parseDate(value: unknown): Date | undefined {
  const text = getString(value);
  if (!text) {
    return undefined;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

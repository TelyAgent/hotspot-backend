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

type Fetcher = (url: string) => Promise<Response>;

interface YoutubeApiVideoItem {
  id: string;
  snippet?: YoutubeSnippet;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

interface YoutubeApiSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: YoutubeSnippet;
}

interface YoutubeSnippet {
  title?: string;
  publishedAt?: string;
  channelId?: string;
  channelTitle?: string;
  liveBroadcastContent?: string;
  thumbnails?: Record<string, { url?: string }>;
}

interface YoutubeApiListResponse<T> {
  items?: T[];
}

type YoutubeVideoPayload = JsonObject & {
  videoId: string;
  url: string;
  title: string;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  duration: string | null;
  liveBroadcastContent: string | null;
  selectionSources: JsonValue;
  matchedKeywords: JsonValue;
  keywordHitCount: number;
  discoveryLabels: JsonValue;
  videoMetrics: JsonObject;
  raw: JsonValue;
};

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_REGION_CODE = 'US';
const DEFAULT_CATEGORIES = ['22', '25', '28'];
const DEFAULT_KEYWORDS = ['Polymarket', 'web3', 'politics', 'prediction market'];

@Injectable()
export class YoutubeVideosPlugin implements DataSourcePlugin {
  readonly id = 'youtube-videos';
  readonly name = 'YouTube 视频发现';
  readonly platform = 'youtube';
  readonly capabilities = [
    {
      id: 'youtube.videos.discover',
      name: '采集 YouTube 热门与关键词视频',
      description: '通过 YouTube Data API 采集官方热门分类和关键词搜索结果，并标准化为视频 Signal。',
      defaultLimit: 10,
      inputSchema: {
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            description: 'YouTube videoCategoryId 列表。',
          },
          keywords: {
            type: 'array',
            description: '关键词搜索列表。',
          },
          regionCode: {
            type: 'string',
            description: 'YouTube 地区代码，默认 US。',
          },
          perCategoryLimit: {
            type: 'number',
            description: '每个官方热门分类保留数量。',
          },
          perKeywordLimit: {
            type: 'number',
            description: '每个关键词保留数量。',
          },
          publishedAfter: {
            type: 'string',
            description: '关键词搜索发布时间下限 ISO 字符串。',
          },
        },
      },
    },
  ];

  constructor(private readonly configService: ConfigService) {}

  async collect(input: DataSourceCollectInput): Promise<DataSourceCollectResult> {
    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
    if (!apiKey) {
      throw new DomainError(
        'YOUTUBE_API_KEY is required for youtube.videos.discover.',
        'YOUTUBE_API_KEY_NOT_CONFIGURED',
      );
    }

    const fetcher = globalThis.fetch as Fetcher | undefined;
    if (!fetcher) {
      throw new DomainError(
        'fetch is not available in this runtime.',
        'FETCH_NOT_AVAILABLE',
      );
    }

    const regionCode = getString(input.params.regionCode) ?? DEFAULT_REGION_CODE;
    const categories = getStringArray(input.params.categories, DEFAULT_CATEGORIES);
    const keywords = getStringArray(input.params.keywords, DEFAULT_KEYWORDS);
    const perCategoryLimit = getNumber(input.params.perCategoryLimit, 5);
    const perKeywordLimit = getNumber(input.params.perKeywordLimit, 5);
    const publishedAfter =
      getString(input.params.publishedAfter) ??
      new Date(input.context.observedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const trendingItemsByCategory: Record<string, YoutubeApiVideoItem[]> = {};
    for (const category of categories) {
      trendingItemsByCategory[category] = (
        await this.getList<YoutubeApiVideoItem>('videos', 'videos.list', apiKey, fetcher, {
          part: 'snippet,statistics',
          chart: 'mostPopular',
          regionCode,
          videoCategoryId: category,
          maxResults: '10',
        })
      ).slice(0, perCategoryLimit);
    }

    const searchItemsByKeyword: Record<string, YoutubeApiSearchItem[]> = {};
    for (const keyword of keywords) {
      searchItemsByKeyword[keyword] = (
        await this.getList<YoutubeApiSearchItem>('search', 'search.list', apiKey, fetcher, {
          part: 'snippet',
          q: keyword,
          type: 'video',
          order: 'viewCount',
          publishedAfter,
          regionCode,
          relevanceLanguage: 'en',
          maxResults: '10',
        })
      ).slice(0, perKeywordLimit);
    }

    const videoIds = unique([
      ...Object.values(trendingItemsByCategory).flat().map((item) => item.id),
      ...Object.values(searchItemsByKeyword)
        .flat()
        .map((item) => item.id?.videoId)
        .filter((id): id is string => Boolean(id)),
    ]);
    const details = await this.listVideosByIds(videoIds, apiKey, fetcher);
    const detailMap = new Map(details.map((item) => [item.id, item]));
    const candidates = buildCandidates({
      trendingItemsByCategory,
      searchItemsByKeyword,
      detailMap,
    }).filter((candidate) => candidate.liveBroadcastContent !== 'live' && candidate.liveBroadcastContent !== 'upcoming');

    return {
      rawItems: candidates.map((candidate) => ({
        source: this.platform,
        sourceType: 'youtube_video',
        sourceItemId: candidate.videoId,
        observedAt: input.context.observedAt,
        payload: candidate,
        metadata: {
          pluginId: this.id,
          capabilityId: input.capabilityId,
          videoId: candidate.videoId,
          sourceTypes: getSelectionTypes(candidate.selectionSources),
        },
      })),
      summary: {
        categories,
        keywords,
        officialCount: candidates.filter((candidate) =>
          hasSelectionType(candidate.selectionSources, 'youtube_trending'),
        ).length,
        keywordCount: candidates.filter((candidate) =>
          hasSelectionType(candidate.selectionSources, 'keyword_search'),
        ).length,
        count: candidates.length,
      },
    };
  }

  async normalize(
    input: DataSourceNormalizeInput,
  ): Promise<DataSourceNormalizeResult | null> {
    if (!isJsonObject(input.rawItem.payload)) return null;

    const item = input.rawItem.payload as YoutubeVideoPayload;
    const metrics = isJsonObject(item.videoMetrics) ? item.videoMetrics : {};

    return {
      signal: {
        signalType: 'youtube_video',
        title: item.title,
        summary: `${item.channelTitle ?? '未知频道'} 发布的视频：${item.title}`,
        platform: this.platform,
        metrics,
        metadata: {
          videoId: item.videoId,
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          channelId: item.channelId,
          channelTitle: item.channelTitle,
          publishedAt: item.publishedAt,
          duration: item.duration,
          selectionSources: item.selectionSources,
          matchedKeywords: item.matchedKeywords,
          keywordHitCount: item.keywordHitCount,
          discoveryLabels: item.discoveryLabels,
        },
      },
      evidence: [
        {
          claim: `YouTube 视频「${item.title}」进入采集候选。`,
          sourceType: 'youtube_video',
          sourceItemId: input.rawItem.sourceItemId,
          text: item.title,
          url: item.url,
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined,
          metrics,
          confidence: 'medium',
          metadata: {
            videoId: item.videoId,
            channelTitle: item.channelTitle,
            selectionSources: item.selectionSources,
          },
        },
      ],
    };
  }

  private async listVideosByIds(
    videoIds: string[],
    apiKey: string,
    fetcher: Fetcher,
  ) {
    const chunks = chunk(videoIds, 50);
    const results = await Promise.all(
      chunks.map((ids) =>
        this.getList<YoutubeApiVideoItem>('videos', 'videos.list', apiKey, fetcher, {
          part: 'snippet,statistics,contentDetails',
          id: ids.join(','),
        }),
      ),
    );
    return results.flat();
  }

  private async getList<T>(
    resource: string,
    operation: string,
    apiKey: string,
    fetcher: Fetcher,
    params: Record<string, string>,
  ): Promise<T[]> {
    const url = new URL(`${YOUTUBE_API_BASE_URL}/${resource}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('key', apiKey);

    const response = await fetcher(url.toString());
    if (!response.ok) {
      throw new Error(await buildYoutubeApiErrorMessage(operation, response));
    }
    const payload = (await response.json()) as YoutubeApiListResponse<T>;
    return payload.items ?? [];
  }
}

function buildCandidates(input: {
  trendingItemsByCategory: Record<string, YoutubeApiVideoItem[]>;
  searchItemsByKeyword: Record<string, YoutubeApiSearchItem[]>;
  detailMap: Map<string, YoutubeApiVideoItem>;
}): YoutubeVideoPayload[] {
  const byVideoId = new Map<string, YoutubeVideoPayload>();

  for (const [categoryId, items] of Object.entries(input.trendingItemsByCategory)) {
    items.forEach((item, index) => {
      const detail = input.detailMap.get(item.id) ?? item;
      const candidate = createCandidate(item.id, detail, {
        type: 'youtube_trending',
        label: `YouTube官方热门-${categoryId}`,
        rank: index + 1,
        categoryId,
      });
      mergeCandidate(byVideoId, candidate);
    });
  }

  for (const [keyword, items] of Object.entries(input.searchItemsByKeyword)) {
    items.forEach((item, index) => {
      const videoId = item.id?.videoId;
      if (!videoId) return;
      const detail = input.detailMap.get(videoId);
      const candidate = createCandidate(videoId, detail, {
        type: 'keyword_search',
        label: `关键词-${keyword}`,
        rank: index + 1,
        keyword,
      }, item.snippet);
      mergeCandidate(byVideoId, candidate);
    });
  }

  return [...byVideoId.values()];
}

function createCandidate(
  videoId: string,
  detail: YoutubeApiVideoItem | undefined,
  selectionSource: JsonObject,
  fallbackSnippet?: YoutubeSnippet,
): YoutubeVideoPayload {
  const snippet = detail?.snippet ?? fallbackSnippet;
  const matchedKeyword = getString(selectionSource.keyword);

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet?.title ?? '',
    thumbnailUrl: pickThumbnailUrl(snippet?.thumbnails),
    channelId: snippet?.channelId ?? null,
    channelTitle: snippet?.channelTitle ?? null,
    publishedAt: snippet?.publishedAt ?? null,
    duration: detail?.contentDetails?.duration ?? null,
    liveBroadcastContent: snippet?.liveBroadcastContent ?? null,
    selectionSources: [selectionSource],
    matchedKeywords: matchedKeyword ? [matchedKeyword] : [],
    keywordHitCount: matchedKeyword ? 1 : 0,
    discoveryLabels: [],
    videoMetrics: {
      viewCount: parseMetric(detail?.statistics?.viewCount),
      likeCount: parseMetric(detail?.statistics?.likeCount),
      commentCount: parseMetric(detail?.statistics?.commentCount),
    },
    raw: detail as unknown as JsonValue,
  };
}

function mergeCandidate(
  byVideoId: Map<string, YoutubeVideoPayload>,
  candidate: YoutubeVideoPayload,
) {
  const existing = byVideoId.get(candidate.videoId);
  if (!existing) {
    byVideoId.set(candidate.videoId, candidate);
    return;
  }

  existing.selectionSources = [
    ...(existing.selectionSources as JsonValue[]),
    ...(candidate.selectionSources as JsonValue[]),
  ];
  existing.matchedKeywords = unique([
    ...(existing.matchedKeywords as string[]),
    ...(candidate.matchedKeywords as string[]),
  ]);
  existing.keywordHitCount = (existing.matchedKeywords as string[]).length;
  existing.discoveryLabels = existing.keywordHitCount >= 2 ? ['多关键词命中'] : [];
}

async function buildYoutubeApiErrorMessage(operation: string, response: Response) {
  const parts = [`YouTube API 请求失败：${operation}`, `HTTP ${response.status}`];
  try {
    const body = JSON.parse(await response.text()) as {
      error?: {
        status?: string;
        errors?: Array<{ reason?: string }>;
      };
    };
    const reason = body.error?.errors?.find((item) => item.reason)?.reason;
    if (reason) parts.push(`reason=${reason}`);
    if (body.error?.status) parts.push(`status=${body.error.status}`);
  } catch {
    // 保持安全错误摘要。
  }
  return parts.join('，');
}

function pickThumbnailUrl(thumbnails: Record<string, { url?: string }> | undefined) {
  return thumbnails?.maxres?.url ?? thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
}

function parseMetric(value: string | undefined) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : fallback;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getSelectionTypes(sources: JsonValue) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) => isJsonObject(source) ? getString(source.type) : undefined)
    .filter((type): type is string => Boolean(type));
}

function hasSelectionType(sources: JsonValue, type: string) {
  return getSelectionTypes(sources).includes(type);
}

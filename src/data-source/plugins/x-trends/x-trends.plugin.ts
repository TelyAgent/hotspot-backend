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

interface TwitterApiIoTrend {
  name?: string;
  target?: {
    query?: string;
  };
  rank?: number;
  meta_description?: string;
  trend?: TwitterApiIoTrend;
}

interface TwitterApiIoTrendResponse {
  status?: 'success' | 'error';
  msg?: string;
  trends?: TwitterApiIoTrend[];
}

type XTrendPayload = JsonObject & {
  name?: string;
  query?: string;
  url?: string;
  region?: string;
  rank?: number;
  heat?: string | null;
  category?: string | null;
  raw?: JsonValue;
};

const DEFAULT_BASE_URL = 'https://api.twitterapi.io';
const DEFAULT_REGION_WOEIDS: Record<string, number> = {
  global: 1,
  Worldwide: 1,
  'United States': 23424977,
  'United Kingdom': 23424975,
  Japan: 23424856,
  Korea: 23424868,
};

@Injectable()
export class XTrendsPlugin implements DataSourcePlugin {
  readonly id = 'x-trends';
  readonly name = 'X 热榜采集';
  readonly platform = 'x';
  readonly capabilities = [
    {
      id: 'x.trends.list',
      name: '采集 X 热榜',
      description: '通过 twitterapi.io 按地区采集 X/Twitter 热搜榜，并标准化为 Signal。',
      defaultLimit: 30,
      inputSchema: {
        type: 'object',
        properties: {
          region: {
            type: 'string',
            description: '单个热榜地区，例如 global、United States、Japan。',
          },
          regions: {
            type: 'array',
            description: '多个热榜地区；存在时优先于 region。',
          },
          regionWoeids: {
            type: 'object',
            description: '地区到 WOEID 的映射。',
          },
          limit: {
            type: 'number',
            description: '每个地区输出条数，默认 30。',
          },
          count: {
            type: 'number',
            description: '第三方接口请求条数，最小 30。',
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
        'TWITTERAPI_IO_KEY is required for x.trends.list.',
        'TWITTERAPI_IO_KEY_NOT_CONFIGURED',
      );
    }

    const baseUrl = (
      this.configService.get<string>('TWITTERAPI_BASE_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/$/, '');
    const regions = resolveRegions(input.params);
    const regionWoeids = {
      ...DEFAULT_REGION_WOEIDS,
      ...resolveRegionWoeids(input.params.regionWoeids),
    };
    const requestCount = Math.max(
      30,
      getNumber(input.params.count, getNumber(input.params.limit, 30)),
    );
    const outputLimit = getNumber(input.params.limit, requestCount);
    const fetcher = globalThis.fetch as Fetcher | undefined;

    if (!fetcher) {
      throw new DomainError(
        'fetch is not available in this runtime.',
        'FETCH_NOT_AVAILABLE',
      );
    }

    const settled = await Promise.allSettled(
      regions.map((region) =>
        this.fetchRegionTrends({
          region,
          woeid: regionWoeids[region],
          baseUrl,
          apiKey,
          requestCount,
          outputLimit,
          observedAt: input.context.observedAt,
          fetcher,
        }),
      ),
    );
    const successful = settled
      .filter(
        (result): result is PromiseFulfilledResult<XTrendPayload[]> =>
          result.status === 'fulfilled',
      )
      .flatMap((result) => result.value);

    if (successful.length === 0) {
      throw new DomainError(
        `twitterapi.io x.trends.list failed for all regions: ${settled
          .map((result, index) => formatRegionalFailure(regions[index], result))
          .join('; ')}`,
        'X_TRENDS_REQUEST_FAILED',
      );
    }

    return {
      rawItems: successful.map((item) => ({
        source: this.platform,
        sourceType: 'x_trend',
        sourceItemId: `${item.region}:${item.rank}:${item.name}`,
        observedAt: input.context.observedAt,
        payload: item,
        metadata: {
          pluginId: this.id,
          capabilityId: input.capabilityId,
          region: item.region ?? 'global',
          rank: item.rank ?? 0,
        },
      })),
      summary: {
        regions,
        requestCount,
        outputLimit,
        count: successful.length,
        failedRegionCount: settled.filter((result) => result.status === 'rejected')
          .length,
      },
    };
  }

  async normalize(
    input: DataSourceNormalizeInput,
  ): Promise<DataSourceNormalizeResult | null> {
    if (!isJsonObject(input.rawItem.payload)) {
      return null;
    }

    const item = input.rawItem.payload as XTrendPayload;
    const title = getString(item.name) ?? '未命名热榜项';
    const region =
      getString(item.region) ??
      getMetadataString(input.rawItem.metadata, 'region') ??
      'global';
    const rank = getNumber(
      item.rank,
      getMetadataNumber(input.rawItem.metadata, 'rank') ?? 0,
    );
    const metrics: JsonObject = {
      rank,
      heat: getString(item.heat) ?? null,
      category: getString(item.category) ?? null,
    };

    return {
      signal: {
        signalType: 'x_trend',
        title,
        summary: `${title} 出现在 ${region} X 热榜，排名第 ${rank || '未知'}。`,
        platform: this.platform,
        metrics,
        metadata: {
          region,
          query: getString(item.query) ?? title,
          sourceItemId: input.rawItem.sourceItemId ?? null,
        },
      },
      evidence: [
        {
          claim: `${title} 出现在 ${region} X 热榜。`,
          sourceType: 'x_trend',
          sourceItemId: input.rawItem.sourceItemId,
          text: title,
          url: getString(item.url),
          metrics,
          confidence: 'medium',
          metadata: {
            region,
            rank,
          },
        },
      ],
    };
  }

  private async fetchRegionTrends(input: {
    region: string;
    woeid?: number;
    baseUrl: string;
    apiKey: string;
    requestCount: number;
    outputLimit: number;
    observedAt: Date;
    fetcher: Fetcher;
  }): Promise<XTrendPayload[]> {
    if (!input.woeid) {
      throw new Error('No WOEID configured');
    }

    const url = `${input.baseUrl}/twitter/trends?woeid=${input.woeid}&count=${input.requestCount}`;
    const response = await input.fetcher(url, {
      headers: {
        'X-API-Key': input.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }

    const body = (await response.json()) as TwitterApiIoTrendResponse;

    if (body.status === 'error') {
      throw new Error(body.msg ?? 'unknown error');
    }

    return (body.trends ?? []).slice(0, input.outputLimit).map((item, index) => {
      const trend = item.trend ?? item;
      const name = trend.name ?? trend.target?.query ?? `trend-${index + 1}`;
      const query = normalizeTrendQuery(trend.target?.query ?? name);
      const rank = trend.rank ?? index + 1;

      return {
        name,
        query,
        region: input.region,
        rank,
        url: `https://x.com/search?q=${encodeURIComponent(query)}`,
        heat: trend.meta_description ?? null,
        category: trend.meta_description ?? null,
        raw: item as unknown as JsonValue,
      };
    });
  }
}

function resolveRegions(params: JsonObject): string[] {
  if (Array.isArray(params.regions)) {
    const regions = params.regions.filter(
      (region): region is string => typeof region === 'string' && Boolean(region.trim()),
    );

    if (regions.length > 0) {
      return regions;
    }
  }

  const region = getString(params.region);
  return region ? [region] : ['global'];
}

function resolveRegionWoeids(value: JsonValue | undefined): Record<string, number> {
  if (!isJsonObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([region, woeid]) => [region, getNumber(woeid)] as const)
      .filter(([, woeid]) => woeid > 0),
  );
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeTrendQuery(value: string) {
  return value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
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

function getMetadataString(
  value: JsonValue | null | undefined,
  key: string,
): string | undefined {
  return isJsonObject(value) ? getString(value[key]) : undefined;
}

function getMetadataNumber(
  value: JsonValue | null | undefined,
  key: string,
): number | undefined {
  return isJsonObject(value) ? getNumber(value[key]) : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatRegionalFailure(
  region: string,
  result: PromiseSettledResult<XTrendPayload[]>,
) {
  if (result.status === 'fulfilled') {
    return `${region}: success`;
  }

  const reason =
    result.reason instanceof Error ? result.reason.message : String(result.reason);
  return `${region}: ${reason}`;
}

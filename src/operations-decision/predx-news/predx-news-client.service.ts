import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { PredxNewsNormalizerService } from './predx-news-normalizer.service';

@Injectable()
export class PredxNewsClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly normalizer: PredxNewsNormalizerService,
  ) {
    this.baseUrl =
      this.configService.get<string>('PREDX_NEWS_API_URL') ??
      'https://api.predx.pro/api/v1/news/latest-news';
  }

  async fetchLatest(input: { pageSize?: number; index?: number } = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('page_size', String(input.pageSize ?? 20));
    url.searchParams.set('index', String(input.index ?? 0));

    const response = await fetch(url);
    const payload = (await response.json().catch(() => null)) as
      | { code?: number; data?: { items?: unknown[] }; message?: string }
      | null;

    if (!response.ok || !payload || payload.code !== 200) {
      throw new DomainError(
        payload?.message ?? 'PredX 新闻接口请求失败。',
        'PREDX_NEWS_REQUEST_FAILED',
        { status: response.status },
      );
    }

    return (payload.data?.items ?? [])
      .filter((item): item is JsonObject => isJsonObject(item))
      .map((item) => this.normalizer.normalize(item));
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

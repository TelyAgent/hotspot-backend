import { Injectable } from '@nestjs/common';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { PredxNewsItemInput } from '../operations-decision.types';

@Injectable()
export class PredxNewsNormalizerService {
  normalize(value: JsonObject): PredxNewsItemInput {
    const factId = readStringOrNumber(value.fact_id);
    const eventId = readStringOrNumber(value.event_id);
    const title = readString(value.event_title) ?? readString(value.news_title) ?? '未命名 PredX 新闻';
    const publishedAt = readDate(value.news_published_at) ?? readDate(value.fact_first_time) ?? new Date();

    return {
      externalId: factId ? `fact:${factId}` : `news:${readString(value.news_id) ?? title}`,
      eventId,
      factId,
      title,
      newsTitle: readString(value.news_title),
      sourceName: readString(value.news_source),
      sourceUrl: readString(value.news_url),
      category: readString(value.fact_category),
      publishedAt,
      latestAt: readDate(value.fact_latest_time) ?? readDate(value.event_latest_time),
      primaryMarketTitle: readString(value.primary_market_title),
      primaryMarketUrl: readString(value.primary_market_url),
      primaryMarketConfidence: readNumber(value.primary_market_confidence),
      associatedMarketDisplayScore: readNumber(value.associated_market_display_score),
      relatedMarkets: Array.isArray(value.related_markets)
        ? (value.related_markets as JsonValue[])
        : [],
      raw: value,
    };
  }
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringOrNumber(value: JsonValue | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return readString(value);
}

function readNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readDate(value: JsonValue | undefined): Date | undefined {
  const text = readString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../../common/types/json.type';
import {
  DataSourceCollectInput,
  DataSourceCollectResult,
  DataSourceNormalizeInput,
  DataSourceNormalizeResult,
  DataSourcePlugin,
} from '../data-source-plugin.interface';
import {
  parseBeaSchedule,
  parseBlsIcsEvents,
  parseFomcCalendar,
  parseOpmHolidays,
} from './future-event-source.parsers';
import {
  FutureSourceConfig,
  FutureSourceType,
  ParsedFutureSourceItem,
} from './future-event-source.types';

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

@Injectable()
export class FutureEventsPlugin implements DataSourcePlugin {
  readonly id = 'future-events';
  readonly name = '未来事件来源采集';
  readonly platform = 'official_schedule';
  readonly capabilities = [
    {
      id: 'future.events.discover',
      name: '采集官方未来事件来源',
      description: '采集 OPM、BEA、BLS、FOMC 等官方日历，并标准化为未来事件 Signal。',
      defaultLimit: 200,
      inputSchema: {
        type: 'object',
        properties: {
          sources: {
            type: 'array',
            description: '来源配置列表，每项必须包含 sourceType 和 variables.url。',
          },
        },
      },
    },
  ];

  async collect(input: DataSourceCollectInput): Promise<DataSourceCollectResult> {
    const fetcher = globalThis.fetch as Fetcher | undefined;
    if (!fetcher) {
      throw new Error('fetch is not available in this runtime.');
    }

    const observedAt = input.context.observedAt;
    const sources = getSourceConfigs(input.params);
    const fetchTimeoutMs = getPositiveNumber(
      input.params.fetchTimeoutMs,
      DEFAULT_FETCH_TIMEOUT_MS,
    );
    const items: ParsedFutureSourceItem[] = [];
    const errors: Array<{ sourceType: string; message: string }> = [];

    for (const source of sources) {
      if (source.enabled === false) continue;

      try {
        const fetched = await fetchSource(source, {
          fetcher,
          retrievedAt: observedAt.toISOString(),
          now: observedAt,
          timeoutMs: fetchTimeoutMs,
        });
        items.push(...fetched.filter((item) => isInCurrentYearWindow(item, observedAt)));
      } catch (error) {
        errors.push({
          sourceType: source.sourceType,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const dedupedItems = dedupeFutureSourceItems(items);

    return {
      rawItems: dedupedItems.map((item) => ({
        source: this.id,
        sourceType: 'future_event_source_item',
        sourceItemId: `${item.sourceType}:${item.sourceItemId}`,
        observedAt,
        payload: { ...item },
        metadata: {
          pluginId: this.id,
          capabilityId: input.capabilityId,
          jobId: input.context.jobId,
          sourceType: item.sourceType,
          sourceItemId: item.sourceItemId,
        },
      })),
      summary: {
        sourceTypes: sources.map((source) => source.sourceType),
        count: dedupedItems.length,
        duplicateCount: items.length - dedupedItems.length,
        errors,
      },
    };
  }

  async normalize(
    input: DataSourceNormalizeInput,
  ): Promise<DataSourceNormalizeResult | null> {
    if (!isRecord(input.rawItem.payload)) return null;

    if (!isFutureSourceItem(input.rawItem.payload)) return null;

    const item = input.rawItem.payload;

    const subject = getSourceSubject(item.sourceType);
    const eventType = getEventType(item.sourceType);
    const scheduledAt = item.startTime;

    return {
      signal: {
        signalType: 'future_event',
        title: item.title,
        summary:
          item.description ??
          `${subject} 官方日程中的未来事件：${item.title}`,
        platform: this.platform,
        metrics: null,
        metadata: {
          sourceType: item.sourceType,
          sourceItemId: item.sourceItemId,
          sourceUrl: item.sourceUrl,
          subject,
          eventType,
          scheduledAt,
          startAt: item.startTime,
          endAt: item.endTime,
          timezone: item.timezone,
          confidence: getConfidence(item.sourceType),
          confirmationLevel: getConfirmationLevel(item.sourceType),
          expressionBoundary: getExpressionBoundary(item.sourceType),
          schedulePrecision: getSchedulePrecision(item),
          jobId: input.context.jobId,
          capabilityId: input.context.capabilityId,
        },
      },
      evidence: [
        {
          claim: `${item.title} 已列入 ${subject} 官方日程。`,
          sourceType: 'future_event_source_item',
          sourceItemId: `${item.sourceType}:${item.sourceItemId}`,
          text: item.description ?? item.title,
          url: item.sourceUrl,
          publishedAt: item.startTime ? new Date(item.startTime) : undefined,
          confidence: getConfidence(item.sourceType),
          metadata: {
            sourceType: item.sourceType,
            sourceItemId: item.sourceItemId,
            retrievedAt: item.retrievedAt,
            raw: item.raw,
          },
        },
      ],
    };
  }
}

function getSourceConfigs(params: JsonObject): FutureSourceConfig[] {
  if (!Array.isArray(params.sources)) {
    throw new Error(
      'future-events requires params.sources with sourceType and variables.url. Configure sources through the Markdown source strategy and generated source plan.',
    );
  }

  const explicitSources = params.sources
    .map(toSourceConfig)
    .filter((item): item is FutureSourceConfig => Boolean(item));
  return explicitSources;
}

function toSourceConfig(value: unknown): FutureSourceConfig | null {
  if (!isRecord(value)) return null;
  const sourceType = getFutureSourceType(value.sourceType);
  const variables = isRecord(value.variables) ? value.variables : {};
  if (!sourceType) return null;

  return {
    sourceType,
    displayName: getString(value.displayName),
    enabled: value.enabled === false ? false : true,
    variables,
  };
}

async function fetchSource(
  source: FutureSourceConfig,
  input: {
    fetcher: Fetcher;
    retrievedAt: string;
    now: Date;
    timeoutMs: number;
  },
) {
  const url = requireString(source.variables.url, `${source.sourceType}.variables.url`);
  const response = await fetchWithTimeout(input.fetcher, url, input.timeoutMs);
  if (!response.ok) {
    throw new Error(`${source.sourceType} fetch failed: ${response.status}`);
  }
  const text = await response.text();

  if (source.sourceType === 'bls') {
    return parseBlsIcsEvents(text, {
      sourceUrl: url,
      retrievedAt: input.retrievedAt,
      includeReleaseTypes: getStringArray(source.variables.includeReleaseTypes),
    });
  }
  if (source.sourceType === 'bea') {
    return parseBeaSchedule(text, {
      sourceUrl: url,
      retrievedAt: input.retrievedAt,
      now: input.now,
    });
  }
  if (source.sourceType === 'opm') {
    return parseOpmHolidays(text, {
      sourceUrl: url,
      retrievedAt: input.retrievedAt,
      now: input.now,
    });
  }
  return parseFomcCalendar(text, {
    sourceUrl: url,
    retrievedAt: input.retrievedAt,
    now: input.now,
  });
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`future event source fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetcher(url, { signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isInCurrentYearWindow(item: ParsedFutureSourceItem, now: Date) {
  if (!item.startTime) return false;

  const startTime = new Date(item.startTime);
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfNextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  return startTime >= startOfToday && startTime < startOfNextYear;
}

function dedupeFutureSourceItems(items: ParsedFutureSourceItem[]) {
  const seen = new Set<string>();
  const deduped: ParsedFutureSourceItem[] = [];

  for (const item of items) {
    const key = [
      item.sourceType,
      normalizeDedupeText(item.title),
      item.startTime ?? '',
      item.endTime ?? '',
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function normalizeDedupeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isFutureSourceItem(value: unknown): value is ParsedFutureSourceItem {
  if (!isRecord(value)) return false;

  return (
    getFutureSourceType(value.sourceType) !== null &&
    typeof value.sourceItemId === 'string' &&
    typeof value.sourceUrl === 'string' &&
    typeof value.retrievedAt === 'string' &&
    typeof value.title === 'string'
  );
}

function getFutureSourceType(value: unknown): FutureSourceType | null {
  return value === 'bls' || value === 'bea' || value === 'opm' || value === 'fomc'
    ? value
    : null;
}

function getSourceSubject(sourceType: FutureSourceType) {
  const labels: Record<FutureSourceType, string> = {
    bls: 'BLS',
    bea: 'BEA',
    opm: 'OPM',
    fomc: 'FOMC',
  };
  return labels[sourceType];
}

function getEventType(sourceType: FutureSourceType) {
  const types: Record<FutureSourceType, string> = {
    bls: 'economic_release',
    bea: 'economic_release',
    opm: 'calendar_holiday',
    fomc: 'policy_meeting',
  };
  return types[sourceType];
}

function getConfidence(sourceType: FutureSourceType): 'high' | 'medium' | 'low' {
  return sourceType === 'opm' ? 'medium' : 'high';
}

function getConfirmationLevel(sourceType: FutureSourceType) {
  return sourceType === 'opm' ? 'confirmed' : 'fixed';
}

function getExpressionBoundary(sourceType: FutureSourceType) {
  return sourceType === 'opm' ? 'qualified' : 'factual';
}

function getSchedulePrecision(item: ParsedFutureSourceItem) {
  if (item.startTime && item.endTime) return 'date_range';
  if (item.startTime && /T00:00:00\.000Z$/.test(item.startTime)) return 'date';
  return item.startTime ? 'exact_time' : 'unknown';
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function getPositiveNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function requireString(value: unknown, name: string) {
  const stringValue = getString(value);
  if (!stringValue) {
    throw new Error(`${name} is required`);
  }
  return stringValue;
}

import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject, JsonValue } from '../common/types/json.type';
import { Event, EventLabel } from '../opportunity/opportunity.types';
import { OpportunityRepository } from '../opportunity/opportunity.repository';
import {
  clampMcpLimit,
  McpEvidenceItem,
  McpGetHotEventDetailInput,
  McpHotEventListItem,
  McpSearchHotEventsInput,
  parseOptionalDate,
  readStringArray,
} from './mcp.types';

const DOMAIN_LABELS = new Set([
  'AI',
  'Technology',
  'Politics & Elections',
  'Geopolitics & Conflict',
  'Macro & Financial Markets',
  'Crypto & Web3',
  'Prediction Markets',
  'Official Schedule',
]);

const SOURCE_LABELS = new Set(['X Trend', 'Topic Circle', 'Future Event']);
const HEAT_LABELS = new Set(['Top5', 'Fast Rising', 'Multi-region', '第一方确认', 'Re-entry']);

type McpEventRecord = Event & {
  contextVersion?: number | null;
  sourceSummary?: JsonValue | null;
};

type McpEvidenceRecord = {
  id: string;
  sourceTool?: string | null;
  sourceType: string;
  sourceItemId?: string | null;
  claim: string;
  text?: string | null;
  url?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
  observedAt: Date;
  metrics?: JsonValue | null;
  confidence: string;
  metadata?: JsonValue | null;
};

@Injectable()
export class McpHotEventService {
  constructor(private readonly repository: OpportunityRepository) {}

  async searchHotEvents(input: McpSearchHotEventsInput = {}): Promise<McpHotEventListItem[]> {
    const events = await this.repository.listEventsForMcp({
      query: input.query,
      domains: readStringArray(input.domains),
      sources: readStringArray(input.sources),
      labels: readStringArray(input.labels),
      since: parseOptionalDate(input.since),
      limit: clampMcpLimit(input.limit),
    });

    return (events as McpEventRecord[]).map((event) => this.toListItem(event));
  }

  async getHotEventDetail(input: McpGetHotEventDetailInput) {
    if (!input.eventId || typeof input.eventId !== 'string') {
      throw new DomainError('eventId 不能为空。', 'MCP_EVENT_ID_REQUIRED');
    }

    const event = (await this.repository.findEventForMcp(input.eventId)) as McpEventRecord | null;
    if (!event) {
      throw new DomainError('未找到指定热点事件。', 'MCP_EVENT_NOT_FOUND');
    }

    const evidenceRefs = normalizeStringArray(event.evidenceRefs);
    const evidence = ((await this.repository.listEvidenceForMcp(evidenceRefs)) as McpEvidenceRecord[]).map((item) =>
      this.toEvidenceItem(item),
    );
    const eventDto = this.toListItem(event);
    const timeline = this.buildTimeline(event, evidence);

    return {
      event: {
        ...eventDto,
        missingData: normalizeStringArray(event.missingData),
        riskNotes: normalizeStringArray(event.riskNotes),
        contextVersion: event.contextVersion ?? 1,
      },
      evidence,
      timeline,
      promptContext: this.buildPromptContext(eventDto, evidence, timeline, event),
    };
  }

  private toListItem(event: McpEventRecord): McpHotEventListItem {
    const labels = normalizeLabels(event.labels);
    return {
      eventId: event.id,
      title: event.title,
      summary: event.summary,
      domains: labels.filter((label) => DOMAIN_LABELS.has(label)),
      sourceLabels: labels.filter((label) => SOURCE_LABELS.has(label)),
      heatLabels: labels.filter((label) => HEAT_LABELS.has(label)),
      triggerReason: readTriggerReason(event),
      confidence: event.confidence,
      status: event.status,
      evidenceCount: normalizeStringArray(event.evidenceRefs).length,
      occurredAt: toIso(event.occurredAt),
      observedAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }

  private toEvidenceItem(evidence: McpEvidenceRecord): McpEvidenceItem {
    const metadata = asObject(evidence.metadata);
    const authorHandle = readString(metadata.authorHandle) ?? readString(metadata.handle);
    return {
      evidenceId: evidence.id,
      source: evidence.sourceType,
      sourceName: evidence.sourceTool ?? evidence.sourceType,
      authorName: evidence.author ?? authorHandle ?? null,
      authorHandle,
      title: evidence.sourceItemId ?? null,
      text: evidence.text ?? null,
      summary: evidence.claim,
      url: evidence.url ?? readString(metadata.url) ?? null,
      publishedAt: toIso(evidence.publishedAt),
      observedAt: evidence.observedAt.toISOString(),
      metrics: evidence.metrics ?? null,
      verificationStatus: evidence.confidence,
    };
  }

  private buildTimeline(event: McpEventRecord, evidence: McpEvidenceItem[]) {
    const items = evidence
      .flatMap((item) => [
        item.publishedAt
          ? {
              time: item.publishedAt,
              title: '证据来源发布',
              description: `${item.sourceName}${item.authorName ? ` · ${item.authorName}` : ''}`,
            }
          : null,
        {
          time: item.observedAt,
          title: '证据被系统采集',
          description: item.summary,
        },
      ])
      .filter((item): item is { time: string; title: string; description: string } => Boolean(item));

    items.push({
      time: event.createdAt.toISOString(),
      title: '热点事件形成',
      description: readTriggerReason(event) ?? '热点挖掘 Agent 形成事件判断。',
    });
    items.push({
      time: event.updatedAt.toISOString(),
      title: '事件上下文更新',
      description: `当前 Context Pack v${event.contextVersion ?? 1}`,
    });

    return items.sort((a, b) => a.time.localeCompare(b.time));
  }

  private buildPromptContext(
    event: McpHotEventListItem,
    evidence: McpEvidenceItem[],
    timeline: Array<{ time: string; title: string; description: string }>,
    rawEvent: McpEventRecord,
  ): string {
    const evidenceText = evidence.length
      ? evidence
          .map(
            (item, index) =>
              `${index + 1}. ${item.sourceName}${item.authorName ? ` / ${item.authorName}` : ''}：${item.summary}\n` +
              `   链接：${item.url ?? '暂无'}\n` +
              `   发布时间：${item.publishedAt ?? '暂无'}；采集时间：${item.observedAt}`,
          )
          .join('\n')
      : '暂无可展示证据。';
    const timelineText = timeline.map((item) => `- ${item.time}：${item.title}。${item.description}`).join('\n');

    return [
      `【事件】${event.title}`,
      `【摘要】${event.summary}`,
      `【领域】${event.domains.join('、') || '未标注'}`,
      `【触发标签】${[...event.sourceLabels, ...event.heatLabels].join('、') || '未标注'}`,
      `【触发原因】${event.triggerReason ?? '暂无明确触发原因'}`,
      `【置信度】${event.confidence}`,
      `【风险提示】${normalizeStringArray(rawEvent.riskNotes).join('；') || '暂无'}`,
      `【缺失数据】${normalizeStringArray(rawEvent.missingData).join('；') || '暂无'}`,
      `【证据】\n${evidenceText}`,
      `【时间线】\n${timelineText}`,
    ].join('\n\n');
  }
}

function normalizeLabels(labels: EventLabel[] | JsonValue | null | undefined): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((label) => {
      if (typeof label === 'string') {
        return label;
      }
      if (label && typeof label === 'object' && 'name' in label) {
        return String((label as { name?: unknown }).name ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readTriggerReason(event: McpEventRecord): string | undefined {
  const sourceSummary = asObject(event.sourceSummary);
  const sourceTriggerReason = readString(sourceSummary.triggerReason);
  if (sourceTriggerReason) {
    return sourceTriggerReason;
  }

  return event.triggerReasons?.[0]?.text;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

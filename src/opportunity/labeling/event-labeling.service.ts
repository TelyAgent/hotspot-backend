import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../common/types/json.type';
import { PrismaService } from '../../database/prisma.service';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { EventLabel } from '../opportunity.types';
import { EventDomainLabelService } from './event-domain-label.service';

const FIXED_SOURCE_HEAT_LABELS = new Set([
  'X Trend',
  'Topic Circle',
  'Future Event',
  'Top5',
  'Fast Rising',
  'Multi-region',
  '第一方确认',
  'Re-entry',
]);

@Injectable()
export class EventLabelingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventDomainLabelService: EventDomainLabelService,
  ) {}

  async buildLabels(input: { evidence: EvidenceItem[] }): Promise<EventLabel[]> {
    const labels: EventLabel[] = [];
    labels.push(...this.buildSourceLabels(input.evidence));
    labels.push(...(await this.buildXTrendTriggerLabels(input.evidence)));
    labels.push(...(await this.buildTopicCircleTriggerLabels(input.evidence)));
    labels.push(...this.buildFutureEventTriggerLabels(input.evidence));
    labels.push(
      ...this.eventDomainLabelService.buildDomainLabels({
        evidence: input.evidence,
      }),
    );
    return labels.filter((label) => label.category === 'domain' || FIXED_SOURCE_HEAT_LABELS.has(label.code));
  }

  private buildSourceLabels(evidence: EvidenceItem[]): EventLabel[] {
    const groups = new Map<string, EvidenceItem[]>();
    evidence.forEach((item) => {
      const sourcePath = sourceTypeToSourcePath(item.sourceType);
      if (!sourcePath) return;
      groups.set(sourcePath, [...(groups.get(sourcePath) ?? []), item]);
    });

    return Array.from(groups.entries())
      .flatMap(([sourcePath, items]) => {
        const label = sourcePathLabel(sourcePath);
        if (!label) return [];
        return [{
          code: label,
          name: label,
          category: 'source',
          sourcePath,
          evidenceRefs: items.map((item) => item.id),
          reason: `事件包含 ${label} 的真实证据。`,
          confidence: 'high',
        } satisfies EventLabel];
      });
  }

  private async buildXTrendTriggerLabels(evidence: EvidenceItem[]): Promise<EventLabel[]> {
    const xTrendEvidence = evidence.filter((item) => sourceTypeToSourcePath(item.sourceType) === 'x_trend');
    const labels: EventLabel[] = [];

    const top5Evidence = xTrendEvidence.filter((item) => {
      const rank = getMetadataNumber(item.metadata, 'rank');
      return typeof rank === 'number' && rank <= 5;
    });
    if (top5Evidence.length > 0) {
      labels.push({
        code: 'Top5',
        name: 'Top5',
        category: 'trigger',
        sourcePath: 'x_trend',
        evidenceRefs: top5Evidence.map((item) => item.id),
        reason: 'X 热搜证据中存在排名进入前 5 的趋势。',
        confidence: 'high',
      });
    }

    const fastRisingEvidence = await this.findFastRisingEvidence(xTrendEvidence);
    if (fastRisingEvidence.length > 0) {
      labels.push({
        code: 'Fast Rising',
        name: 'Fast Rising',
        category: 'trigger',
        sourcePath: 'x_trend',
        evidenceRefs: fastRisingEvidence.map((item) => item.id),
        reason: 'X 热搜快照对比显示排名上升达到阈值。',
        confidence: 'high',
      });
    }

    const regions = distinctMetadataValues(xTrendEvidence, 'region');
    if (regions.length >= 2) {
      labels.push({
        code: 'Multi-region',
        name: 'Multi-region',
        category: 'trigger',
        sourcePath: 'x_trend',
        evidenceRefs: xTrendEvidence.map((item) => item.id),
        reason: `同一事件在 ${regions.join('、')} 等多个 X 热榜地区出现。`,
        confidence: 'high',
      });
    }

    return labels;
  }

  private async findFastRisingEvidence(evidence: EvidenceItem[]): Promise<EvidenceItem[]> {
    const directEvidence = evidence.filter(hasFastRisingEvidence);
    const directIds = new Set(directEvidence.map((item) => item.id));
    const lookupEvidence = evidence.filter((item) => !directIds.has(item.id));
    const fromDiffs: EvidenceItem[] = [];

    for (const item of lookupEvidence) {
      if (await this.hasRecentFastRisingDiff(item)) {
        fromDiffs.push(item);
      }
    }

    return [...directEvidence, ...fromDiffs];
  }

  private async hasRecentFastRisingDiff(evidence: EvidenceItem): Promise<boolean> {
    const metadata = isJsonObject(evidence.metadata) ? evidence.metadata : {};
    const query = getString(metadata.query) ?? getString(evidence.text) ?? getString(evidence.claim);
    if (!query) return false;

    const diff = await this.prisma.xTrendSnapshotDiff.findFirst({
      where: {
        query: {
          equals: query,
          mode: 'insensitive',
        },
        region: getString(metadata.region) ?? undefined,
        rankDelta: {
          gte: 10,
        },
        diffType: 'up',
      },
      orderBy: {
        observedAt: 'desc',
      },
    });

    return diff !== null;
  }

  private async buildTopicCircleTriggerLabels(evidence: EvidenceItem[]): Promise<EventLabel[]> {
    const labels: EventLabel[] = [];
    const topicEvidence = evidence.filter((item) => sourceTypeToSourcePath(item.sourceType) === 'topic_circle');

    for (const item of topicEvidence) {
      const metadata = isJsonObject(item.metadata) ? item.metadata : {};
      const topicWatchId = getString(metadata.topicWatchId);
      const authorHandle = getString(metadata.authorHandle);
      if (!topicWatchId || !authorHandle) continue;

      const account = await this.prisma.topicWatchAccount.findFirst({
        where: {
          topicWatchId,
          handle: {
            equals: normalizeHandle(authorHandle),
            mode: 'insensitive',
          },
          status: 'active',
        },
      });
      if (!account) continue;

      if (account.singleTriggerPolicy === 'S1') {
        labels.push({
          code: '第一方确认',
          name: '第一方确认',
          category: 'trigger',
          sourcePath: 'topic_circle',
          evidenceRefs: [item.id],
          reason: `@${account.handle} 是 S1 第一方权威账号，权威范围：${account.authorityScope}`,
          confidence: 'high',
        });
      }

      // S2 等账号角色只参与事件判断和证据解释，不作为固定来源/热度筛选标签输出。
    }

    return dedupeLabels(labels);
  }

  private buildFutureEventTriggerLabels(_evidence: EvidenceItem[]): EventLabel[] {
    return [];
  }
}

function sourceTypeToSourcePath(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  if (normalized === 'x_trend' || normalized.startsWith('x_trend_')) return 'x_trend';
  if (
    normalized === 'topic_watch' ||
    normalized === 'topic_circle' ||
    normalized === 'x_account_post' ||
    normalized === 'x_post'
  ) {
    return 'topic_circle';
  }
  if (
    normalized === 'future_event_candidate' ||
    normalized === 'future_event_source_item' ||
    normalized === 'future_event_monitoring' ||
    ['bea', 'bls', 'fomc', 'opm'].includes(normalized)
  ) {
    return 'future_event';
  }
  if (normalized === 'youtube_video') return 'youtube';
  return null;
}

function sourcePathLabel(sourcePath: string) {
  const names: Record<string, string> = {
    x_trend: 'X Trend',
    topic_circle: 'Topic Circle',
    future_event: 'Future Event',
  };
  return names[sourcePath] ?? null;
}

function hasFastRisingEvidence(item: EvidenceItem) {
  const rank = getMetadataNumber(item.metadata, 'rank');
  const previousRank = getMetadataNumber(item.metadata, 'previousRank');
  if (typeof rank === 'number' && typeof previousRank === 'number' && previousRank - rank >= 10) {
    return true;
  }

  const rankDelta = getMetadataNumber(item.metadata, 'rankDelta');
  if (typeof rankDelta === 'number' && rankDelta >= 10) return true;

  const rankChange = getMetadataNumber(item.metadata, 'rankChange');
  return typeof rankChange === 'number' && rankChange >= 10;
}

function getMetadataNumber(metadata: unknown, key: string) {
  if (!isJsonObject(metadata)) return null;
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function distinctMetadataValues(evidence: EvidenceItem[], key: string) {
  return Array.from(
    new Set(
      evidence
        .map((item) => (isJsonObject(item.metadata) ? item.metadata[key] : null))
        .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number'),
    ),
  );
}

function dedupeLabels(labels: EventLabel[]) {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const key = `${label.code}:${label.evidenceRefs.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../common/types/json.type';
import { PrismaService } from '../../database/prisma.service';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { EventLabel } from '../opportunity.types';

@Injectable()
export class EventLabelingService {
  constructor(private readonly prisma: PrismaService) {}

  async buildLabels(input: { evidence: EvidenceItem[] }): Promise<EventLabel[]> {
    const labels: EventLabel[] = [];
    labels.push(...this.buildSourceLabels(input.evidence));
    labels.push(...(await this.buildXTrendTriggerLabels(input.evidence)));
    labels.push(...(await this.buildTopicCircleTriggerLabels(input.evidence)));
    labels.push(...this.buildFutureEventTriggerLabels(input.evidence));
    return labels;
  }

  private buildSourceLabels(evidence: EvidenceItem[]): EventLabel[] {
    const groups = new Map<string, EvidenceItem[]>();
    evidence.forEach((item) => {
      const sourcePath = sourceTypeToSourcePath(item.sourceType);
      if (!sourcePath) return;
      groups.set(sourcePath, [...(groups.get(sourcePath) ?? []), item]);
    });

    return Array.from(groups.entries()).map(([sourcePath, items]) => ({
      code: sourcePath,
      name: sourcePathName(sourcePath),
      category: 'source',
      sourcePath,
      evidenceRefs: items.map((item) => item.id),
      reason: `事件包含 ${sourcePathName(sourcePath)} 的真实证据。`,
      confidence: 'high',
    }));
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
        code: 'x_trend_top_5',
        name: 'Top 5',
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
        code: 'x_trend_fast_rising',
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
        code: 'x_trend_multi_region',
        name: '多地区上榜',
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
          code: 'first_party_confirmed',
          name: '第一方确认',
          category: 'trigger',
          sourcePath: 'topic_circle',
          evidenceRefs: [item.id],
          reason: `@${account.handle} 是 S1 第一方权威账号，权威范围：${account.authorityScope}`,
          confidence: 'high',
        });
      }

      if (account.singleTriggerPolicy === 'S2') {
        labels.push({
          code: 'key_person_confirmed',
          name: '核心人物确认',
          category: 'trigger',
          sourcePath: 'topic_circle',
          evidenceRefs: [item.id],
          reason: `@${account.handle} 是 S2 核心人物与决策者，权威范围：${account.authorityScope}`,
          confidence: 'high',
        });
      }
    }

    return dedupeLabels(labels);
  }

  private buildFutureEventTriggerLabels(evidence: EvidenceItem[]): EventLabel[] {
    const futureEvidence = evidence.filter((item) => sourceTypeToSourcePath(item.sourceType) === 'future_event');
    if (!futureEvidence.length) return [];

    const labels: EventLabel[] = [
      {
        code: 'future_event_official_schedule',
        name: '官方日程确认',
        category: 'trigger',
        sourcePath: 'future_event',
        evidenceRefs: futureEvidence.map((item) => item.id),
        reason: '事件证据来自 Future Event 官方或准官方日程源。',
        confidence: 'high',
      },
    ];

    const actionScoreEvidence = futureEvidence.filter((item) => {
      const actionScore = getMetadataNumber(item.metadata, 'actionScore');
      return typeof actionScore === 'number' && actionScore >= 80;
    });
    if (actionScoreEvidence.length > 0) {
      labels.push({
        code: 'future_event_action_score_80',
        name: 'Action Score 80+',
        category: 'trigger',
        sourcePath: 'future_event',
        evidenceRefs: actionScoreEvidence.map((item) => item.id),
        reason: 'Future Event Action Score 达到 80 分以上。',
        confidence: 'high',
      });
    }

    return labels;
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

function sourcePathName(sourcePath: string) {
  const names: Record<string, string> = {
    x_trend: 'X 热搜',
    topic_circle: '关注圈层',
    future_event: 'Future Event',
    youtube: 'YouTube',
  };
  return names[sourcePath] ?? sourcePath;
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

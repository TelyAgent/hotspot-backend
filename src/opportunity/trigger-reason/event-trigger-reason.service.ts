import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JsonObject } from '../../common/types/json.type';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { Event } from '../opportunity.types';

export interface EventTriggerReason {
  code: string;
  text: string;
  evidenceRefs: string[];
  sourcePath: string;
}

@Injectable()
export class EventTriggerReasonService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTriggerReasons(input: {
    event: Event;
    evidence: EvidenceItem[];
  }): Promise<EventTriggerReason[]> {
    const reasons = [
      ...this.buildXTrendReasons(input.evidence),
      ...(await this.buildTopicCircleReasons(input.evidence)),
      ...this.buildFutureEventReasons(input.evidence),
    ];

    return dedupeReasons(reasons);
  }

  async attachTriggerReasons<T extends Event>(events: T[]): Promise<Array<T & { triggerReasons: EventTriggerReason[] }>> {
    const evidenceRefs = Array.from(
      new Set(events.flatMap((event) => getStringArray(event.evidenceRefs))),
    );
    const evidence = evidenceRefs.length
      ? ((await this.prisma.evidenceItem.findMany({
          where: {
            id: {
              in: evidenceRefs,
            },
          },
        })) as unknown as EvidenceItem[])
      : [];
    const evidenceById = new Map(evidence.map((item) => [item.id, item]));

    return Promise.all(
      events.map(async (event) => {
        const eventEvidence = getStringArray(event.evidenceRefs)
          .map((id) => evidenceById.get(id))
          .filter((item): item is EvidenceItem => Boolean(item));
        return {
          ...event,
          triggerReasons: await this.buildTriggerReasons({
            event,
            evidence: eventEvidence,
          }),
        };
      }),
    );
  }

  private buildXTrendReasons(evidence: EvidenceItem[]): EventTriggerReason[] {
    const xTrendEvidence = evidence.filter((item) => sourceTypeToSourcePath(item.sourceType) === 'x_trend');
    const reasons: EventTriggerReason[] = [];

    xTrendEvidence.forEach((item) => {
      const metadata = asJsonObject(item.metadata);
      const rank = getNumber(metadata.rank);
      const region = getString(metadata.region) ?? '未知地区';
      if (rank != null && rank <= 10) {
        reasons.push({
          code: 'TR-01',
          text: `TR-01：首次进入输入榜单前 10，${region} 当前排名第 ${rank}。`,
          evidenceRefs: [item.id],
          sourcePath: 'x_trend',
        });
      }

      const previousRank = getNumber(metadata.previousRank);
      const rankDelta = getNumber(metadata.rankDelta) ?? (
        previousRank != null && rank != null ? previousRank - rank : null
      );
      if (rankDelta != null && rankDelta >= 10) {
        reasons.push({
          code: 'TR-02',
          text: `TR-02：相邻两次成功快照间排名上升 ${rankDelta} 位。`,
          evidenceRefs: [item.id],
          sourcePath: 'x_trend',
        });
      }

      if (getBoolean(metadata.reEntry) || getString(metadata.diffType) === 're_entry') {
        reasons.push({
          code: 'TR-Re-entry',
          text: `Re-entry：${region} 榜单中重新上榜，表示该趋势再次进入观察范围。`,
          evidenceRefs: [item.id],
          sourcePath: 'x_trend',
        });
      }
    });

    const regions = Array.from(
      new Set(
        xTrendEvidence
          .map((item) => getString(asJsonObject(item.metadata).region))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (regions.length >= 2) {
      reasons.push({
        code: 'TR-04',
        text: `TR-04：同一事件同时出现在 ${regions.length} 个输入地区榜单：${regions.join('、')}。`,
        evidenceRefs: xTrendEvidence.map((item) => item.id),
        sourcePath: 'x_trend',
      });
    }

    return reasons;
  }

  private async buildTopicCircleReasons(evidence: EvidenceItem[]): Promise<EventTriggerReason[]> {
    const topicEvidence = evidence.filter((item) => sourceTypeToSourcePath(item.sourceType) === 'topic_circle');
    const reasons: EventTriggerReason[] = [];

    for (const item of topicEvidence) {
      const candidate = await this.findTopicCandidate(item);
      if (!candidate) continue;
      const metrics = asJsonObject(candidate.metrics);
      const b3h = getNumber(metrics.b3h);
      const b24h = getNumber(metrics.b24h);
      const tmax = getNumber(metrics.tmax);
      const tmaxTop5Percent = getBoolean(metrics.tmaxTop5Percent);

      if (b3h != null && b3h >= 3) {
        reasons.push({
          code: 'TC-01',
          text: `TC-01：最近 3 小时内出现集中讨论，B3h = ${b3h}，达到 B3h >= 3。`,
          evidenceRefs: [item.id],
          sourcePath: 'topic_circle',
        });
      }
      if (b24h != null && b24h >= 6) {
        reasons.push({
          code: 'TC-02',
          text: `TC-02：24 小时内持续热议，B24h = ${b24h}，达到 B24h >= 6。`,
          evidenceRefs: [item.id],
          sourcePath: 'topic_circle',
        });
      }
      if (tmax != null && tmax >= 3 && tmaxTop5Percent) {
        reasons.push({
          code: 'TC-03',
          text: `TC-03：单点流量爆发，Tmax = ${formatNumber(tmax)}，且该帖子进入账号近期表现前 5%。`,
          evidenceRefs: [item.id],
          sourcePath: 'topic_circle',
        });
      }
      if (b3h != null && b3h >= 2 && tmax != null && tmax >= 2) {
        reasons.push({
          code: 'TC-04',
          text: `TC-04：讨论与流量混合上升，B3h = ${b3h}，Tmax = ${formatNumber(tmax)}。`,
          evidenceRefs: [item.id],
          sourcePath: 'topic_circle',
        });
      }
    }

    return reasons;
  }

  private buildFutureEventReasons(evidence: EvidenceItem[]): EventTriggerReason[] {
    return evidence
      .filter((item) => sourceTypeToSourcePath(item.sourceType) === 'future_event')
      .flatMap((item) => {
        const metadata = asJsonObject(item.metadata);
        const reason = getString(metadata.triggerReason) ?? getString(metadata.reason);
        if (!reason) return [];
        return [{
          code: getString(metadata.triggerRuleCode) ?? 'FE',
          text: reason,
          evidenceRefs: [item.id],
          sourcePath: 'future_event',
        }];
      });
  }

  private async findTopicCandidate(evidence: EvidenceItem): Promise<{ metrics: unknown } | null> {
    if (!evidence.signalId) return null;
    return this.prisma.topicCandidate.findFirst({
      where: {
        representativeSignalIds: {
          array_contains: evidence.signalId,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        metrics: true,
      },
    });
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
  return null;
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function formatNumber(value: number) {
  return Number(value.toFixed(2));
}

function dedupeReasons(reasons: EventTriggerReason[]) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.code}:${reason.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

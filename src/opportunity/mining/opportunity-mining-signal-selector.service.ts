import { Injectable } from '@nestjs/common';
import { JsonValue } from '../../common/types/json.type';
import { PrismaService } from '../../database/prisma.service';
import { Signal } from '../../signal/signal/signal.types';
import { OpportunityRulePackLoaderService } from '../rule-pack/opportunity-rule-pack-loader.service';
import { OpportunityRuleRoute } from '../rule-pack/opportunity-rule-pack.types';

const PRIORITY_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
};
const FUTURE_EVENT_AUTO_EVENT_SCORE_THRESHOLD = 80;

@Injectable()
export class OpportunityMiningSignalSelectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rulePackLoader: OpportunityRulePackLoaderService,
  ) {}

  async select(input: {
    now: Date;
    take: number;
  }): Promise<Signal[]> {
    const rulePack = await this.rulePackLoader.loadActiveRulePack();
    const routes = rulePack.routes.filter((route) => route.signalType !== 'default');
    const candidates = await Promise.all(
      routes.map((route) => this.selectByRoute(route, input.now)),
    );

    return candidates
      .flat()
      .sort((left, right) => {
        const priorityDelta =
          PRIORITY_WEIGHT[right.route.priority] - PRIORITY_WEIGHT[left.route.priority];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return right.signal.observedAt.getTime() - left.signal.observedAt.getTime();
      })
      .slice(0, Math.max(input.take, 1))
      .map((item) => item.signal);
  }

  private async selectByRoute(route: OpportunityRuleRoute, now: Date) {
    const observedAfter = new Date(
      now.getTime() - Math.max(route.lookbackHours, 1) * 60 * 60 * 1000,
    );
    const signals = await this.prisma.signal.findMany({
      where: {
        signalType: route.signalType,
        observedAt: {
          gte: observedAfter,
        },
        opportunityMiningRuns: {
          none: {
            status: 'succeeded',
          },
        },
      },
      take: Math.max(route.batchLimit, 1),
      orderBy: {
        observedAt: 'desc',
      },
    });

    return (signals as unknown as Signal[])
      .filter((signal) => this.canAutoMineSignal(signal))
      .map((signal) => ({
        route,
        signal,
      }));
  }

  private canAutoMineSignal(signal: Signal): boolean {
    if (signal.signalType !== 'future_event') {
      return true;
    }

    return (
      this.extractActionScoreTotal(signal.metadata) >=
      FUTURE_EVENT_AUTO_EVENT_SCORE_THRESHOLD
    );
  }

  private extractActionScoreTotal(metadata: JsonValue | null | undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return 0;
    }

    const actionScore = metadata.actionScore;
    if (
      actionScore &&
      typeof actionScore === 'object' &&
      !Array.isArray(actionScore) &&
      typeof actionScore.total === 'number' &&
      Number.isFinite(actionScore.total)
    ) {
      return actionScore.total;
    }

    if (
      typeof metadata.actionScoreTotal === 'number' &&
      Number.isFinite(metadata.actionScoreTotal)
    ) {
      return metadata.actionScoreTotal;
    }

    return this.scoreFutureEventMetadata(metadata);
  }

  private scoreFutureEventMetadata(metadata: Record<string, unknown>) {
    const eventType = optionalString(metadata.eventType) ?? '';
    const scheduledAt = optionalString(metadata.scheduledAt) ??
      optionalString(metadata.startAt);
    const confidence = optionalString(metadata.confidence) ?? 'medium';
    const text = [
      optionalString(metadata.subject),
      eventType,
      optionalString(metadata.sourceType),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const scope = includesAny(text, ['economic', 'policy', 'macro', 'finance', 'fomc', 'bea', 'bls'])
      ? 10
      : includesAny(text, ['holiday', 'calendar'])
        ? 4
        : 4;
    const relevance = includesAny(text, ['economic', 'policy', 'macro', 'finance', 'fomc', 'bea', 'bls'])
      ? 8
      : 3;
    const outcomeImportance = includesAny(text, ['fomc', 'rate', 'gdp', 'cpi', 'ppi', 'employment', 'jobs', 'payroll'])
      ? 10
      : includesAny(text, ['income', 'outlays', 'trade', 'profits', 'investment'])
        ? 8
        : includesAny(text, ['holiday', 'calendar'])
          ? 3
          : 5;
    const evidence = confidence === 'high' ? 19 : confidence === 'low' ? 9 : 15;
    const heatMomentum = 0;
    const timeUrgency = scoreTimeUrgency(scheduledAt ? new Date(scheduledAt) : null);
    const contentReadiness = 3;

    return scope + relevance + outcomeImportance + evidence + heatMomentum + timeUrgency + contentReadiness;
  }
}

function scoreTimeUrgency(scheduledAt: Date | null) {
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return 0;

  const diffDays = (scheduledAt.getTime() - Date.now()) / 86_400_000;
  if (diffDays < 0) return 0;
  if (diffDays <= 2) return 10;
  if (diffDays <= 30) return 8;
  if (diffDays <= 60) return 4;
  return 0;
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

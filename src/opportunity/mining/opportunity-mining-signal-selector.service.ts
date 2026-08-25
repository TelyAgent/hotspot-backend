import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Signal } from '../../signal/signal/signal.types';
import { OpportunityRulePackLoaderService } from '../rule-pack/opportunity-rule-pack-loader.service';
import { OpportunityRuleRoute } from '../rule-pack/opportunity-rule-pack.types';

const PRIORITY_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1,
};

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

    return (signals as unknown as Signal[]).map((signal) => ({
      route,
      signal,
    }));
  }
}


import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Signal } from '../../signal/signal/signal.types';
import { OpportunityMiningOrchestratorService } from './opportunity-mining-orchestrator.service';
import { OpportunityMiningSignalSelectorService } from './opportunity-mining-signal-selector.service';
import { OpportunityMiningGoalType } from './opportunity-mining-goal.types';

const DEFAULT_TICK_MS = 60 * 1000;
const DEFAULT_BATCH_SIZE = 10;

@Injectable()
export class OpportunityMiningSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpportunityMiningSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly selector: OpportunityMiningSignalSelectorService,
    private readonly orchestrator: OpportunityMiningOrchestratorService,
  ) {}

  onModuleInit(): void {
    if (this.isDisabled()) {
      this.logger.log('Opportunity mining scheduler disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.getTickMs());
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runDueMining(now: Date): Promise<{ selectedCount: number; succeededCount: number }> {
    if (this.isDisabled()) {
      return {
        selectedCount: 0,
        succeededCount: 0,
      };
    }

    const signals = await this.selector.select({
      now,
      take: this.getBatchSize(),
    });
    let succeededCount = 0;

    for (const signal of signals) {
      try {
        await this.orchestrator.run({
          goal: this.orchestrator.createGoal({
            type: this.inferGoalType(signal),
            instruction: '根据当前 active 规则包判断这条 Signal 是否形成热点机会。',
            seedSignalIds: [signal.id],
            sourceContext: {
              signalType: signal.signalType,
              source: signal.source,
              platform: signal.platform ?? null,
            },
            writeMode: 'allow_create',
          }),
        });
        succeededCount += 1;
      } catch (error) {
        this.logger.error(
          `Opportunity mining failed for signal=${signal.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Opportunity mining scheduled run finished, selected=${signals.length}, succeeded=${succeededCount}`,
    );

    return {
      selectedCount: signals.length,
      succeededCount,
    };
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.runDueMining(new Date());
    } finally {
      this.running = false;
    }
  }

  private inferGoalType(signal: Signal): OpportunityMiningGoalType {
    if (signal.signalType === 'youtube_video') {
      return 'analyze_viral_content';
    }

    if (signal.signalType === 'future_event') {
      return 'future_event_response';
    }

    if (signal.signalType === 'x_account_post') {
      return 'analyze_hot_topic';
    }

    return 'detect_opportunity';
  }

  private isDisabled() {
    return (
      this.configService.get<string>('OPPORTUNITY_MINING_SCHEDULER_ENABLED') ===
      'false'
    );
  }

  private getTickMs() {
    const value = this.configService.get<string>('OPPORTUNITY_MINING_TICK_MS');
    const parsed = value ? Number.parseInt(value, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TICK_MS;
  }

  private getBatchSize() {
    const value = this.configService.get<string>('OPPORTUNITY_MINING_BATCH_SIZE');
    const parsed = value ? Number.parseInt(value, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BATCH_SIZE;
  }
}

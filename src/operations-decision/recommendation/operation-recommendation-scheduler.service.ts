import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OperationRecommendationService } from './operation-recommendation.service';

const DEFAULT_TICK_MS = 60 * 1000;
const DEFAULT_RECOMMENDATION_INTERVAL_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class OperationRecommendationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationRecommendationSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastStartedAt?: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly recommendationService: OperationRecommendationService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('OPERATIONS_DECISION_RECOMMENDATION_SCHEDULER_ENABLED') === 'false') {
      this.logger.log('Operation recommendation scheduler disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick(new Date());
    }, DEFAULT_TICK_MS);
    void this.tick(new Date());
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async tick(nowDate: Date) {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.runDueRecommendations(nowDate);
    } catch (error) {
      this.logger.error(
        `Operation recommendation scheduled run crashed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  async runDueRecommendations(nowDate: Date) {
    const now = nowDate.getTime();
    const intervalMs = this.getRecommendationIntervalMs();

    if (this.lastStartedAt && now - this.lastStartedAt < intervalMs) {
      return;
    }

    this.lastStartedAt = now;
    const result = await this.recommendationService.generate({
      eventTake: 50,
      newsTake: 20,
    });
    this.logger.log(
      `Operation recommendation scheduled run finished, generatedCount=${result.generatedCount}, syncedPredxNewsCount=${result.syncedPredxNewsCount}`,
    );
  }

  private getRecommendationIntervalMs() {
    const value = this.configService.get<string>('OPERATIONS_DECISION_RECOMMENDATION_INTERVAL_MS');
    if (!value) {
      return DEFAULT_RECOMMENDATION_INTERVAL_MS;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_RECOMMENDATION_INTERVAL_MS;
  }
}

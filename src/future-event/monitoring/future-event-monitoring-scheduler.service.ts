import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FutureEventMonitoringExecutionService } from './future-event-monitoring-execution.service';

const DEFAULT_TICK_MS = 60 * 1000;
const DEFAULT_MONITORING_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class FutureEventMonitoringSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FutureEventMonitoringSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastStartedAt?: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly executionService: FutureEventMonitoringExecutionService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('FUTURE_EVENT_MONITORING_SCHEDULER_ENABLED') === 'false') {
      this.logger.log('Future event monitoring scheduler disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, DEFAULT_TICK_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runDueExecution(observedAt: Date) {
    if (
      this.lastStartedAt &&
      observedAt.getTime() - this.lastStartedAt < this.getMonitoringIntervalMs()
    ) {
      return;
    }

    this.lastStartedAt = observedAt.getTime();
    const result = await this.executionService.runDuePlans({ observedAt });
    this.logger.log(
      `Future event monitoring finished, planCount=${result.planCount}, collectionRunCount=${result.collectionRunCount}, signalCount=${result.signalCount}`,
    );
  }

  private async tick() {
    if (this.running) return;

    this.running = true;
    try {
      await this.runDueExecution(new Date());
    } catch (error) {
      this.logger.error(
        `Future event monitoring scheduler crashed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private getMonitoringIntervalMs() {
    const value = this.configService.get<string>('FUTURE_EVENT_MONITORING_INTERVAL_MS');
    if (!value) return DEFAULT_MONITORING_INTERVAL_MS;

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MONITORING_INTERVAL_MS;
  }
}

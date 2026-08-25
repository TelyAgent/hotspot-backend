import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FutureEventSourcePlan } from '../future-event.types';
import { FutureEventSourceDiscoveryAgentService } from './future-event-source-discovery-agent.service';
import { FutureEventSourceService } from './future-event-source.service';
import { FutureEventSourceStrategyService } from './future-event-source-strategy.service';

const DEFAULT_TICK_MS = 60 * 1000;
const DEFAULT_COLLECTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FutureEventSourceSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FutureEventSourceSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private readonly runningSources = new Set<string>();
  private generatingSourcePlan = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly sourceService: FutureEventSourceService,
    private readonly strategyService: FutureEventSourceStrategyService,
    private readonly sourceDiscoveryAgent: FutureEventSourceDiscoveryAgentService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('FUTURE_EVENT_SOURCE_SCHEDULER_ENABLED') === 'false') {
      this.logger.log('Future event source scheduler disabled');
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

  async runDueCollection(nowDate: Date) {
    const activePlan = await this.sourceService.findActiveSourcePlan();
    if (activePlan) {
      await this.runActivePlanIfDue(activePlan, nowDate);
      return;
    }

    await this.generateAndRunSourcePlan(nowDate);
  }

  private async generateAndRunSourcePlan(nowDate: Date) {
    if (this.generatingSourcePlan) {
      return;
    }

    this.generatingSourcePlan = true;
    try {
      this.logger.log(
        'Future event source scheduler found no active source plan. Generating one from the Markdown strategy.',
      );
      const strategy = await this.strategyService.readStrategy();
      const plan = await this.sourceDiscoveryAgent.generatePlanFromStrategy({
        strategyMarkdown: strategy.markdown,
        activate: true,
      });
      this.logger.log(
        `Future event source plan generated and activated, plan=${plan.id}, version=${plan.version}`,
      );
      await this.runActivePlanIfDue(plan, nowDate);
    } catch (error) {
      this.logger.error(
        `Future event source plan bootstrap failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.generatingSourcePlan = false;
    }
  }

  private async runActivePlanIfDue(
    plan: FutureEventSourcePlan,
    nowDate: Date,
  ) {
    if (this.runningSources.has(plan.id)) {
      return;
    }

    const latestStartedAt =
      await this.sourceService.latestActiveSourcePlanRunStartedAt();
    if (
      latestStartedAt &&
      nowDate.getTime() - latestStartedAt.getTime() < this.getPlanIntervalMs(plan)
    ) {
      return;
    }

    this.runningSources.add(plan.id);
    try {
      const result = await this.sourceService.collectActiveSourcePlan(nowDate);
      this.logger.log(
        `Future source plan collection finished, plan=${plan.id}, sourceCount=${result?.sourceCount ?? 0}, signalCount=${result?.signalCount ?? 0}, candidateCount=${result?.candidateCount ?? 0}`,
      );
    } catch (error) {
      this.logger.error(
        `Future source plan ${plan.id} collection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.runningSources.delete(plan.id);
    }
  }

  private async tick() {
    try {
      await this.runDueCollection(new Date());
    } catch (error) {
      this.logger.error(
        `Future event source scheduler crashed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private getCollectionIntervalMs() {
    const value = this.configService.get<string>('FUTURE_EVENT_SOURCE_COLLECTION_INTERVAL_MS');
    if (!value) return DEFAULT_COLLECTION_INTERVAL_MS;

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_COLLECTION_INTERVAL_MS;
  }

  private getPlanIntervalMs(plan: FutureEventSourcePlan) {
    const value = plan.refreshPolicy.intervalMs;
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : this.getCollectionIntervalMs();
  }
}

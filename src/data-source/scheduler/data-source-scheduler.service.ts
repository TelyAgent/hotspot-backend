import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectConfigService } from '../../project-config/project-config.service';
import { CollectionRunnerService } from '../runner/collection-runner.service';

const DEFAULT_REGION_WOEIDS = {
  global: 1,
  Worldwide: 1,
  'United States': 23424977,
  'United Kingdom': 23424975,
  Japan: 23424856,
  Korea: 23424868,
};
const DEFAULT_TICK_MS = 60 * 1000;

@Injectable()
export class DataSourceSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataSourceSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastStartedAt?: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly runner: CollectionRunnerService,
    private readonly projectConfigService: ProjectConfigService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('DATA_SOURCE_SCHEDULER_ENABLED') === 'false') {
      this.logger.log('Data source scheduler disabled');
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

  private async tick() {
    if (this.running) {
      return;
    }

    await this.runDueCollection(new Date());
  }

  async runDueCollection(nowDate: Date) {
    const now = nowDate.getTime();
    const collectionConfig =
      await this.projectConfigService.getXTrendCollectionConfig();
    const intervalMs = collectionConfig.collectionIntervalMs;

    if (this.lastStartedAt && now - this.lastStartedAt < intervalMs) {
      return;
    }

    this.running = true;
    this.lastStartedAt = now;

    try {
      const run = await this.runner.run({
        id: 'x-trends-default',
        pluginId: 'x-trends',
        capabilityId: 'x.trends.list',
        params: {
          regions: collectionConfig.regions,
          regionWoeids: DEFAULT_REGION_WOEIDS,
          limit: collectionConfig.limit,
        },
        observedAt: nowDate,
      });
      this.logger.log(
        `X trends scheduled collection finished, run=${run.id}, status=${run.status}, rawItemCount=${run.rawItemCount}`,
      );
    } catch (error) {
      this.logger.error(
        `X trends scheduled collection crashed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}

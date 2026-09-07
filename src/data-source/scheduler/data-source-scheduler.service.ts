import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectConfigService } from '../../project-config/project-config.service';
import { CollectionRunRepository } from '../runner/collection-run.repository';
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
  private runningTrends = false;
  private runningKolRadar = false;
  private lastTrendsStartedAt?: number;
  private lastKolRadarStartedAt?: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly runner: CollectionRunnerService,
    private readonly projectConfigService: ProjectConfigService,
    private readonly collectionRunRepository: CollectionRunRepository,
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
    await Promise.all([
      this.runDueTrendCollection(new Date()),
      this.runDueKolRadarCollection(new Date()),
    ]);
  }

  async runDueTrendCollection(nowDate: Date) {
    const now = nowDate.getTime();
    const collectionConfig =
      await this.projectConfigService.getXTrendCollectionConfig();
    if (!collectionConfig.trendCollectionEnabled) {
      return;
    }

    const intervalMs = collectionConfig.collectionIntervalMs;

    if (this.runningTrends) {
      return;
    }

    if (this.lastTrendsStartedAt && now - this.lastTrendsStartedAt < intervalMs) {
      return;
    }

    const latestRun = await this.collectionRunRepository.findLatestByPlugin({
      pluginId: 'x-trends',
      statuses: ['running', 'succeeded'],
    });
    if (latestRun && now - latestRun.startedAt.getTime() < intervalMs) {
      this.lastTrendsStartedAt = latestRun.startedAt.getTime();
      return;
    }

    this.runningTrends = true;
    this.lastTrendsStartedAt = now;

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
      this.runningTrends = false;
    }
  }

  async runDueKolRadarCollection(nowDate: Date) {
    const now = nowDate.getTime();
    const collectionConfig =
      await this.projectConfigService.getXTrendCollectionConfig();
    if (!collectionConfig.kolRadarEnabled) {
      return;
    }

    const handles = collectionConfig.kolRadarAccounts
      .filter((account) => account.enabled)
      .map((account) => account.handle)
      .filter(Boolean);

    if (handles.length === 0) {
      return;
    }

    const intervalMs = collectionConfig.kolRadarCollectionIntervalMs;

    if (this.runningKolRadar) {
      return;
    }

    if (this.lastKolRadarStartedAt && now - this.lastKolRadarStartedAt < intervalMs) {
      return;
    }

    const latestRun = (
      await this.collectionRunRepository.findByJobIdPrefix({
        jobIdPrefix: 'x-kol-radar-',
        take: 1,
      })
    )[0];
    if (latestRun && now - latestRun.startedAt.getTime() < intervalMs) {
      this.lastKolRadarStartedAt = latestRun.startedAt.getTime();
      return;
    }

    this.runningKolRadar = true;
    this.lastKolRadarStartedAt = now;

    try {
      const run = await this.runner.run({
        id: 'x-kol-radar-default',
        pluginId: 'x-account-posts',
        capabilityId: 'x.account.posts',
        params: {
          handles,
          includeReplies: true,
          includeQuotes: true,
          includeReposts: false,
        },
        observedAt: nowDate,
      });
      this.logger.log(
        `KOL radar scheduled collection finished, run=${run.id}, status=${run.status}, rawItemCount=${run.rawItemCount}`,
      );
    } catch (error) {
      this.logger.error(
        `KOL radar scheduled collection crashed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.runningKolRadar = false;
    }
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YoutubeService } from './youtube.service';

const DEFAULT_TICK_MS = 60 * 1000;
const DEFAULT_COLLECTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class YoutubeSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YoutubeSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly youtubeService: YoutubeService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('YOUTUBE_SCHEDULER_ENABLED') === 'false') {
      this.logger.log('YouTube scheduler disabled');
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
    const latestRun = await this.youtubeService.latestRun();
    const intervalMs = this.getCollectionIntervalMs();
    const latestStartedAt = getStartedAtMs(latestRun);

    if (latestStartedAt && nowDate.getTime() - latestStartedAt < intervalMs) {
      return;
    }

    const run = await this.youtubeService.run();
    this.logger.log(
      `YouTube scheduled collection finished, run=${run.id}, status=${run.status}, newVideoCount=${run.newVideoCount}`,
    );
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.runDueCollection(new Date());
    } catch (error) {
      this.logger.error(
        `YouTube scheduled collection crashed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private getCollectionIntervalMs() {
    const value = this.configService.get<string>('YOUTUBE_COLLECTION_INTERVAL_MS');
    if (!value) {
      return DEFAULT_COLLECTION_INTERVAL_MS;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_COLLECTION_INTERVAL_MS;
  }
}

function getStartedAtMs(run: unknown) {
  if (!run || typeof run !== 'object') {
    return null;
  }

  const startedAt = (run as { startedAt?: unknown }).startedAt;
  if (startedAt instanceof Date) {
    return startedAt.getTime();
  }

  if (typeof startedAt === 'string' && startedAt.trim()) {
    const parsed = new Date(startedAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

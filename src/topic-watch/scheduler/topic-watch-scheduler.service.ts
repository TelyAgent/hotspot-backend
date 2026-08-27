import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CollectionRunRepository } from '../../data-source/runner/collection-run.repository';
import { TopicWatchCollectionService } from '../collection/topic-watch-collection.service';
import { TopicWatchRepository } from '../topic-watch.repository';

const DEFAULT_TICK_MS = 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 180;

@Injectable()
export class TopicWatchSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TopicWatchSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastStartedAt?: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly topicWatchRepository: TopicWatchRepository,
    private readonly topicWatchCollectionService: TopicWatchCollectionService,
    private readonly collectionRunRepository: CollectionRunRepository,
  ) {}

  onModuleInit(): void {
    if (this.isDisabled()) {
      this.logger.log('Topic watch scheduler disabled');
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
    if (this.isDisabled()) {
      return;
    }

    const now = nowDate.getTime();
    const intervalMinutes =
      await this.topicWatchRepository.getMinimumActiveRefreshIntervalMinutes();
    const intervalMs =
      Math.max(1, intervalMinutes ?? DEFAULT_INTERVAL_MINUTES) * 60 * 1000;

    if (this.lastStartedAt && now - this.lastStartedAt < intervalMs) {
      return;
    }

    const latestRuns = await this.collectionRunRepository.findByJobIdPrefix({
      jobIdPrefix: 'topic_watch_',
      take: 1,
    });
    const latestRun = latestRuns[0];
    if (latestRun && now - latestRun.startedAt.getTime() < intervalMs) {
      this.lastStartedAt = latestRun.startedAt.getTime();
      return;
    }

    this.running = true;
    this.lastStartedAt = now;

    try {
      const result = await this.topicWatchCollectionService.collect({
        observedAt: nowDate,
      });
      this.logger.log(
        `Topic watch scheduled collection finished, topicWatchCount=${result.topicWatchCount}, rawItemCount=${result.rawItemCount}, signalCount=${result.signalCount}, candidateCount=${result.candidateCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Topic watch scheduled collection crashed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private isDisabled() {
    return this.configService.get<string>('TOPIC_WATCH_SCHEDULER_ENABLED') === 'false';
  }
}

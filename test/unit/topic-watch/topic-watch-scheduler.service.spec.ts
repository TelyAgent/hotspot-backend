import { ConfigService } from '@nestjs/config';
import { TopicWatchCollectionService } from '../../../src/topic-watch/collection/topic-watch-collection.service';
import { TopicWatchSchedulerService } from '../../../src/topic-watch/scheduler/topic-watch-scheduler.service';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';

describe('TopicWatchSchedulerService', () => {
  it('runs due topic watch collection using active plan refresh interval', async () => {
    const repository = {
      getMinimumActiveRefreshIntervalMinutes: jest.fn(() => Promise.resolve(180)),
    } as unknown as TopicWatchRepository;
    const collectionService = {
      collect: jest.fn(() =>
        Promise.resolve({
          topicWatchCount: 1,
          sourceCount: 10,
          rawItemCount: 2,
          signalCount: 2,
          evidenceCount: 2,
          candidateCount: 2,
          runs: [],
        }),
      ),
    } as unknown as TopicWatchCollectionService;
    const scheduler = new TopicWatchSchedulerService(
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      repository,
      collectionService,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T00:00:00.000Z'));
    await scheduler.runDueCollection(new Date('2026-08-25T01:00:00.000Z'));
    await scheduler.runDueCollection(new Date('2026-08-25T03:00:00.000Z'));

    expect(collectionService.collect).toHaveBeenCalledTimes(2);
    expect(collectionService.collect).toHaveBeenNthCalledWith(1, {
      observedAt: new Date('2026-08-25T00:00:00.000Z'),
    });
    expect(collectionService.collect).toHaveBeenNthCalledWith(2, {
      observedAt: new Date('2026-08-25T03:00:00.000Z'),
    });
  });

  it('does not run when scheduler is disabled', async () => {
    const collectionService = {
      collect: jest.fn(),
    } as unknown as TopicWatchCollectionService;
    const scheduler = new TopicWatchSchedulerService(
      { get: jest.fn((key: string) => key === 'TOPIC_WATCH_SCHEDULER_ENABLED' ? 'false' : undefined) } as unknown as ConfigService,
      {
        getMinimumActiveRefreshIntervalMinutes: jest.fn(() => Promise.resolve(180)),
      } as unknown as TopicWatchRepository,
      collectionService,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T00:00:00.000Z'));

    expect(collectionService.collect).not.toHaveBeenCalled();
  });
});

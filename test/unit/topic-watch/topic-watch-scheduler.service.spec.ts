import { ConfigService } from '@nestjs/config';
import { TopicWatchCollectionService } from '../../../src/topic-watch/collection/topic-watch-collection.service';
import { TopicWatchSchedulerService } from '../../../src/topic-watch/scheduler/topic-watch-scheduler.service';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';
import { CollectionRunRepository } from '../../../src/data-source/runner/collection-run.repository';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';

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
    const collectionRunRepository = {
      findByJobIdPrefix: jest.fn(() => Promise.resolve([])),
    } as unknown as CollectionRunRepository;
    const scheduler = new TopicWatchSchedulerService(
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      {
        getXTrendCollectionConfig: jest.fn(() =>
          Promise.resolve({ topicWatchSchedulerEnabled: true }),
        ),
      } as unknown as ProjectConfigService,
      repository,
      collectionService,
      collectionRunRepository,
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

  it('does not collect after restart when latest persisted collection is still within interval', async () => {
    const collectionService = {
      collect: jest.fn(),
    } as unknown as TopicWatchCollectionService;
    const collectionRunRepository = {
      findByJobIdPrefix: jest.fn(() =>
        Promise.resolve([
          {
            id: 'run_topic_watch_recent',
            jobId: 'topic_watch_topic-ai-tech_x_OpenAI_1',
            pluginId: 'x-account-posts',
            capabilityId: 'x.account.posts',
            status: 'succeeded',
            startedAt: new Date('2026-08-25T01:30:00.000Z'),
          },
        ]),
      ),
    } as unknown as CollectionRunRepository;
    const scheduler = new TopicWatchSchedulerService(
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      {
        getXTrendCollectionConfig: jest.fn(() =>
          Promise.resolve({ topicWatchSchedulerEnabled: true }),
        ),
      } as unknown as ProjectConfigService,
      {
        getMinimumActiveRefreshIntervalMinutes: jest.fn(() => Promise.resolve(180)),
      } as unknown as TopicWatchRepository,
      collectionService,
      collectionRunRepository,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T03:00:00.000Z'));

    expect(collectionRunRepository.findByJobIdPrefix).toHaveBeenCalledWith({
      jobIdPrefix: 'topic_watch_',
      take: 1,
    });
    expect(collectionService.collect).not.toHaveBeenCalled();
  });

  it('does not run when scheduler is disabled', async () => {
    const collectionService = {
      collect: jest.fn(),
    } as unknown as TopicWatchCollectionService;
    const scheduler = new TopicWatchSchedulerService(
      { get: jest.fn((key: string) => key === 'TOPIC_WATCH_SCHEDULER_ENABLED' ? 'false' : undefined) } as unknown as ConfigService,
      {
        getXTrendCollectionConfig: jest.fn(() =>
          Promise.resolve({ topicWatchSchedulerEnabled: true }),
        ),
      } as unknown as ProjectConfigService,
      {
        getMinimumActiveRefreshIntervalMinutes: jest.fn(() => Promise.resolve(180)),
      } as unknown as TopicWatchRepository,
      collectionService,
      {
        findByJobIdPrefix: jest.fn(() => Promise.resolve([])),
      } as unknown as CollectionRunRepository,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T00:00:00.000Z'));

    expect(collectionService.collect).not.toHaveBeenCalled();
  });

  it('does not run when project config scheduler switch is disabled', async () => {
    const collectionService = {
      collect: jest.fn(),
    } as unknown as TopicWatchCollectionService;
    const collectionRunRepository = {
      findByJobIdPrefix: jest.fn(),
    } as unknown as CollectionRunRepository;
    const scheduler = new TopicWatchSchedulerService(
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      {
        getXTrendCollectionConfig: jest.fn(() =>
          Promise.resolve({ topicWatchSchedulerEnabled: false }),
        ),
      } as unknown as ProjectConfigService,
      {
        getMinimumActiveRefreshIntervalMinutes: jest.fn(() => Promise.resolve(180)),
      } as unknown as TopicWatchRepository,
      collectionService,
      collectionRunRepository,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T00:00:00.000Z'));

    expect(collectionRunRepository.findByJobIdPrefix).not.toHaveBeenCalled();
    expect(collectionService.collect).not.toHaveBeenCalled();
  });
});

import { CollectionRunRepository } from '../../data-source/runner/collection-run.repository';
import { TopicWatchPipelineStatusService } from './topic-watch-pipeline-status.service';

describe('TopicWatchPipelineStatusService', () => {
  it('returns the latest persisted topic watch collection run', async () => {
    const collectionRunRepository = {
      findByJobIdPrefix: jest.fn(() => [
        {
          id: 'run_latest',
          jobId: 'topic_watch_topic-ai-tech_x_OpenAI_abc',
          pluginId: 'x-account-posts',
          capabilityId: 'x.account.posts',
          status: 'succeeded',
          startedAt: new Date('2026-08-25T23:18:33.985Z'),
          finishedAt: new Date('2026-08-25T23:18:36.757Z'),
          rawItemCount: 3,
          errorMessage: null,
        },
      ]),
    } as unknown as CollectionRunRepository;
    const service = new TopicWatchPipelineStatusService(collectionRunRepository);

    const result = await service.getStatus();

    expect(result.latestFetchRun).toEqual({
      id: 'run_latest',
      status: 'succeeded',
      startedAt: '2026-08-25T23:18:33.985Z',
      finishedAt: '2026-08-25T23:18:36.757Z',
      accountCount: 1,
      itemCount: 3,
      error: null,
    });
  });
});

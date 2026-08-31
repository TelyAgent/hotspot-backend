import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { TopicWatchCollectionService } from '../../../src/topic-watch/collection/topic-watch-collection.service';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';

describe('TopicWatchCollectionService', () => {
  it('collects x account posts from active monitoring plan sources', async () => {
    const repository = {
      listActiveTopicWatches: jest.fn(() =>
        Promise.resolve([
          {
            id: 'topic_ai',
            name: 'AI 与科技',
            status: 'active',
          },
        ]),
      ),
      findActiveMonitoringPlan: jest.fn(() =>
        Promise.resolve({
          id: 'plan_1',
          topicWatchId: 'topic_ai',
          version: 1,
          status: 'active',
          sources: [
            {
              platform: 'x',
              sourceType: 'account',
              handle: 'OpenAI',
              includeReplies: true,
              includeQuotes: true,
              includeReposts: false,
              maxPages: 2,
            },
          ],
          refreshPolicy: {
            lookbackMinutes: 180,
          },
        }),
      ),
    } as unknown as TopicWatchRepository;
    const runner = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'run_1',
          status: 'succeeded',
          rawItemCount: 3,
          outputSummary: {
            signalCount: 3,
            evidenceCount: 3,
          },
        }),
      ),
    } as unknown as CollectionRunnerService;
    const service = new TopicWatchCollectionService(
      repository,
      runner,
    );

    const result = await service.collect({
      observedAt: new Date('2026-08-24T12:00:00.000Z'),
    });

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'x-account-posts',
        capabilityId: 'x.account.posts',
        params: expect.objectContaining({
          topicWatchId: 'topic_ai',
          handle: 'OpenAI',
          since: '2026-08-24T09:00:00.000Z',
          until: '2026-08-24T12:00:00.000Z',
          maxPages: 2,
          includeReplies: true,
          includeQuotes: true,
          includeReposts: false,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        topicWatchCount: 1,
        sourceCount: 1,
        rawItemCount: 3,
        signalCount: 3,
        evidenceCount: 3,
        candidateCount: 0,
        triggeredCount: 0,
      }),
    );
  });
});

import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { TopicAggregationService } from '../../../src/topic-watch/aggregation/topic-aggregation.service';
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
      listSignalsForTopicWatch: jest.fn(() =>
        Promise.resolve([
          {
            id: 'sig_1',
            rawItemId: 'raw_1',
            source: 'x',
            platform: 'x',
            signalType: 'x_post',
            title: 'OpenAI 发布新模型',
            summary: 'OpenAI 发布新模型',
            observedAt: new Date('2026-08-24T11:00:00.000Z'),
            rawRefs: ['raw_1'],
            metrics: null,
            metadata: {
              topicWatchId: 'topic_ai',
              authorHandles: ['OpenAI'],
            },
            createdAt: new Date('2026-08-24T11:00:00.000Z'),
            updatedAt: new Date('2026-08-24T11:00:00.000Z'),
          },
        ]),
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
    const aggregationService = {
      aggregate: jest.fn(() =>
        Promise.resolve([
          {
            id: 'candidate_1',
          },
        ]),
      ),
    } as unknown as TopicAggregationService;
    const service = new TopicWatchCollectionService(
      repository,
      runner,
      aggregationService,
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
        candidateCount: 1,
      }),
    );
    expect(repository.listSignalsForTopicWatch).toHaveBeenCalledWith({
      topicWatchId: 'topic_ai',
      windowStartAt: new Date('2026-08-24T09:00:00.000Z'),
      windowEndAt: new Date('2026-08-24T12:00:00.000Z'),
    });
    expect(aggregationService.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatchId: 'topic_ai',
        windowStartAt: new Date('2026-08-24T09:00:00.000Z'),
        windowEndAt: new Date('2026-08-24T12:00:00.000Z'),
      }),
    );
  });
});

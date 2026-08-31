import { TopicWatchCollectionService } from './topic-watch-collection.service';

describe('TopicWatchCollectionService', () => {
  it('collects account posts without aggregating them into topic candidates', async () => {
    const topicWatchRepository = {
      listActiveTopicWatches: jest.fn().mockResolvedValue([
        {
          id: 'topic-prediction-market',
          status: 'active',
        },
      ]),
      findActiveMonitoringPlan: jest.fn().mockResolvedValue({
        id: 'plan_1',
        version: 1,
        sources: [
          {
            platform: 'x',
            sourceType: 'account',
            handle: '@Polymarket',
          },
        ],
        refreshPolicy: {
          lookbackMinutes: 180,
        },
      }),
    };
    const collectionRunner = {
      run: jest.fn().mockResolvedValue({
        id: 'run_1',
        status: 'success',
        rawItemCount: 1,
        errorMessage: null,
        outputSummary: {
          signalCount: 1,
          evidenceCount: 1,
        },
      }),
    };
    const service = new TopicWatchCollectionService(
      topicWatchRepository as never,
      collectionRunner as never,
    );

    const result = await service.collect({
      observedAt: new Date('2026-08-26T09:00:00.000Z'),
    });

    expect(result.rawItemCount).toBe(1);
    expect(result.signalCount).toBe(1);
    expect(result.evidenceCount).toBe(1);
    expect(result.candidateCount).toBe(0);
    expect(result.triggeredCount).toBe(0);
  });
});

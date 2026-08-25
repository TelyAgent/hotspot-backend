import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { FutureEventRepository } from '../../../src/future-event/future-event.repository';
import { FutureEventMonitoringExecutionService } from '../../../src/future-event/monitoring/future-event-monitoring-execution.service';

describe('FutureEventMonitoringExecutionService', () => {
  it('executes active monitoring plan sources through data-source plugins', async () => {
    const observedAt = new Date('2026-09-09T12:00:00.000Z');
    const repository = {
      listActiveMonitoringPlansAt: jest.fn(() =>
        Promise.resolve([
          {
            id: 'plan_1',
            futureEventId: 'future_1',
            monitoringStartAt: new Date('2026-09-08T00:00:00.000Z'),
            monitoringEndAt: new Date('2026-09-11T00:00:00.000Z'),
            status: 'active',
            phases: [
              {
                name: 'near_event',
                startAt: '2026-09-09T00:00:00.000Z',
                endAt: '2026-09-10T00:00:00.000Z',
                sources: [
                  {
                    sourceType: 'x_account',
                    platform: 'x',
                    accounts: ['BLS_gov'],
                    frequency: '2h',
                    fields: ['postId', 'text', 'metrics'],
                    reason: '观察官方账号发布预告。',
                  },
                  {
                    sourceType: 'youtube_search',
                    platform: 'youtube',
                    query: 'CPI inflation',
                    frequency: '6h',
                    fields: ['videoId', 'title', 'statistics'],
                    reason: '观察视频解读热度。',
                  },
                ],
              },
            ],
            triggerRules: [],
            expectedContentAngles: [],
            evidenceRefs: ['signal_1'],
            confidence: 'high',
            missingData: [],
            riskNotes: [],
          },
        ]),
      ),
      createMonitoringRun: jest.fn((input) =>
        Promise.resolve({
          id: 'fmrun_1',
          ...input,
          status: 'running',
        }),
      ),
      finishMonitoringRun: jest.fn((input) =>
        Promise.resolve({
          id: input.id,
          status: input.status,
        }),
      ),
    } as unknown as FutureEventRepository;
    const collectionRunner = {
      run: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'collection_x_1',
          status: 'succeeded',
          rawItemCount: 2,
          outputSummary: { signalCount: 2 },
        })
        .mockResolvedValueOnce({
          id: 'collection_youtube_1',
          status: 'succeeded',
          rawItemCount: 3,
          outputSummary: { signalCount: 3 },
        }),
    } as unknown as CollectionRunnerService;
    const service = new FutureEventMonitoringExecutionService(
      repository,
      collectionRunner,
    );

    const result = await service.runDuePlans({ observedAt });

    expect(repository.listActiveMonitoringPlansAt).toHaveBeenCalledWith(observedAt);
    expect(collectionRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'x-account-posts',
        capabilityId: 'x.account.posts',
        params: expect.objectContaining({
          futureEventId: 'future_1',
          monitoringPlanId: 'plan_1',
          phase: 'near_event',
          handle: 'BLS_gov',
          since: '2026-09-09T10:00:00.000Z',
          until: '2026-09-09T12:00:00.000Z',
        }),
      }),
    );
    expect(collectionRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: 'youtube-videos',
        capabilityId: 'youtube.videos.discover',
        params: expect.objectContaining({
          keywords: ['CPI inflation'],
          futureEventId: 'future_1',
          monitoringPlanId: 'plan_1',
          phase: 'near_event',
        }),
      }),
    );
    expect(repository.finishMonitoringRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fmrun_1',
        status: 'succeeded',
        rawItemCount: 5,
        signalCount: 5,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        planCount: 1,
        collectionRunCount: 2,
        rawItemCount: 5,
        signalCount: 5,
      }),
    );
  });
});

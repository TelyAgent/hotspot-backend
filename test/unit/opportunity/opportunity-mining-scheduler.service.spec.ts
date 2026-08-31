import { ConfigService } from '@nestjs/config';
import { OpportunityMiningOrchestratorService } from '../../../src/opportunity/mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningSchedulerService } from '../../../src/opportunity/mining/opportunity-mining-scheduler.service';
import { OpportunityMiningSignalSelectorService } from '../../../src/opportunity/mining/opportunity-mining-signal-selector.service';

describe('OpportunityMiningSchedulerService', () => {
  it('runs mining for selected signals and isolates failures', async () => {
    const selector = {
      select: jest.fn(() =>
        Promise.resolve([
          {
            id: 'sig_1',
            signalType: 'x_trend',
            source: 'x',
            platform: 'x',
          },
          {
            id: 'sig_2',
            signalType: 'youtube_video',
            source: 'youtube',
            platform: 'youtube',
          },
        ]),
      ),
    } as unknown as OpportunityMiningSignalSelectorService;
    const orchestrator = {
      createGoal: jest.fn((input) => input),
      run: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          decision: {
            decision: 'ignore',
          },
        }),
    } as unknown as OpportunityMiningOrchestratorService;
    const service = new OpportunityMiningSchedulerService(
      {
        get: jest.fn((key: string) => {
          if (key === 'OPPORTUNITY_MINING_SCHEDULER_ENABLED') {
            return 'true';
          }

          if (key === 'OPPORTUNITY_MINING_BATCH_SIZE') {
            return '2';
          }

          return undefined;
        }),
      } as unknown as ConfigService,
      selector,
      orchestrator,
    );

    const result = await service.runDueMining(
      new Date('2026-08-24T12:00:00.000Z'),
    );

    expect(selector.select).toHaveBeenCalledWith({
      now: new Date('2026-08-24T12:00:00.000Z'),
      take: 2,
    });
    expect(orchestrator.run).toHaveBeenCalledTimes(2);
    expect(orchestrator.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        seedSignalIds: ['sig_1'],
        writeMode: 'allow_create',
      }),
    );
    expect(result).toEqual({
      selectedCount: 2,
      succeededCount: 1,
    });
  });

  it('runs topic watch x_post signals with the hot topic mining goal', async () => {
    const selector = {
      select: jest.fn(() =>
        Promise.resolve([
          {
            id: 'sig_topic_post',
            signalType: 'x_post',
            source: 'topic_watch',
            platform: 'x',
          },
        ]),
      ),
    } as unknown as OpportunityMiningSignalSelectorService;
    const orchestrator = {
      createGoal: jest.fn((input) => input),
      run: jest.fn().mockResolvedValue({
        decision: {
          decision: 'ignore',
        },
      }),
    } as unknown as OpportunityMiningOrchestratorService;
    const service = new OpportunityMiningSchedulerService(
      {
        get: jest.fn((key: string) => {
          if (key === 'OPPORTUNITY_MINING_SCHEDULER_ENABLED') {
            return 'true';
          }

          return undefined;
        }),
      } as unknown as ConfigService,
      selector,
      orchestrator,
    );

    await service.runDueMining(new Date('2026-08-28T08:00:00.000Z'));

    expect(orchestrator.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'analyze_hot_topic',
        seedSignalIds: ['sig_topic_post'],
        sourceContext: expect.objectContaining({
          signalType: 'x_post',
          source: 'topic_watch',
          platform: 'x',
        }),
      }),
    );
  });
});

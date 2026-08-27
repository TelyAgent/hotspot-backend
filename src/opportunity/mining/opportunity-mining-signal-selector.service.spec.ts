import { OpportunityMiningSignalSelectorService } from './opportunity-mining-signal-selector.service';

describe('OpportunityMiningSignalSelectorService', () => {
  it('keeps future event signals below action score 80 out of automatic event mining', async () => {
    const now = new Date('2026-08-27T00:00:00.000Z');
    const prisma = {
      signal: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'future_signal_low_score',
              signalType: 'future_event',
              observedAt: now,
              metadata: {
                actionScore: {
                  total: 70,
                },
              },
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'x_trend_signal',
              signalType: 'x_trend',
              observedAt: now,
            },
          ]),
      },
    };
    const rulePackLoader = {
      loadActiveRulePack: jest.fn().mockResolvedValue({
        routes: [
          {
            signalType: 'future_event',
            lookbackHours: 720,
            batchLimit: 10,
            priority: 'medium',
          },
          {
            signalType: 'x_trend',
            lookbackHours: 24,
            batchLimit: 10,
            priority: 'high',
          },
        ],
      }),
    };
    const selector = new OpportunityMiningSignalSelectorService(
      prisma as never,
      rulePackLoader as never,
    );

    const selected = await selector.select({ now, take: 10 });

    expect(selected.map((signal) => signal.id)).toEqual(['x_trend_signal']);
  });

  it('scores distant routine future events from metadata and keeps them out of automatic event mining', async () => {
    const now = new Date('2026-08-27T00:00:00.000Z');
    const prisma = {
      signal: {
        findMany: jest.fn().mockResolvedValueOnce([
          {
            id: 'christmas_signal',
            signalType: 'future_event',
            observedAt: now,
            metadata: {
              eventType: 'calendar_holiday',
              sourceType: 'opm',
              subject: 'OPM',
              scheduledAt: '2026-12-25T00:00:00.000Z',
              confidence: 'medium',
            },
          },
        ]),
      },
    };
    const rulePackLoader = {
      loadActiveRulePack: jest.fn().mockResolvedValue({
        routes: [
          {
            signalType: 'future_event',
            lookbackHours: 720,
            batchLimit: 10,
            priority: 'medium',
          },
        ],
      }),
    };
    const selector = new OpportunityMiningSignalSelectorService(
      prisma as never,
      rulePackLoader as never,
    );

    const selected = await selector.select({ now, take: 10 });

    expect(selected).toEqual([]);
  });
});

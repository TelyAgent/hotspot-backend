import { PrismaService } from '../../../src/database/prisma.service';
import { OpportunityMiningSignalSelectorService } from '../../../src/opportunity/mining/opportunity-mining-signal-selector.service';
import { OpportunityRulePackLoaderService } from '../../../src/opportunity/rule-pack/opportunity-rule-pack-loader.service';

describe('OpportunityMiningSignalSelectorService', () => {
  it('selects signals by active rule routes and excludes successfully mined signals', async () => {
    const prisma = {
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'sig_1',
              signalType: 'x_trend',
              source: 'x',
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const rulePackLoader = {
      loadActiveRulePack: jest.fn(() =>
        Promise.resolve({
          routes: [
            {
              signalType: 'x_trend',
              documents: ['x-trend-rules'],
              lookbackHours: 12,
              batchLimit: 3,
              priority: 'high',
            },
          ],
        }),
      ),
    } as unknown as OpportunityRulePackLoaderService;
    const service = new OpportunityMiningSignalSelectorService(
      prisma,
      rulePackLoader,
    );

    const result = await service.select({
      now: new Date('2026-08-24T12:00:00.000Z'),
      take: 10,
    });

    expect(prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          signalType: 'x_trend',
          observedAt: {
            gte: new Date('2026-08-24T00:00:00.000Z'),
          },
          opportunityMiningRuns: {
            none: {
              status: 'succeeded',
            },
          },
        }),
        take: 3,
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'sig_1',
      }),
    ]);
  });
});


import { OverviewService } from '../../../src/performance/overview/overview.service';
import { PrismaService } from '../../../src/database/prisma.service';

describe('OverviewService', () => {
  it('aggregates overview metrics from published posts, snapshots, and events', async () => {
    const prisma = {
      publishedPost: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'post_1',
              contentTaskId: 'hotspot_operation:event_1',
              accountId: 'predx',
              accountName: '@PredX',
              publishedAt: new Date('2026-08-24T02:00:00.000Z'),
              trackingStatus: 'active',
              metricSnapshots: [
                {
                  likes: 20,
                  replies: 5,
                  reposts: 3,
                  quotes: 1,
                  views: 2000,
                  isMissingData: false,
                  errorMessage: null,
                  observedAt: new Date('2026-08-24T04:00:00.000Z'),
                },
              ],
            },
            {
              id: 'post_2',
              contentTaskId: 'hotspot_operation:event_2',
              accountId: 'predx-cn',
              accountName: '@PredX_CN',
              publishedAt: new Date('2026-08-24T03:00:00.000Z'),
              trackingStatus: 'failed',
              metricSnapshots: [
                {
                  likes: null,
                  replies: null,
                  reposts: null,
                  quotes: null,
                  views: null,
                  isMissingData: true,
                  errorMessage: '接口失败',
                  observedAt: new Date('2026-08-24T05:00:00.000Z'),
                },
              ],
            },
          ]),
        ),
      },
      event: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'event_1',
              title: 'AI 发布新模型',
              createdAt: new Date('2026-08-24T01:00:00.000Z'),
              missingData: [],
              riskNotes: [],
              confidence: 'high',
              status: 'suggested',
            },
            {
              id: 'event_2',
              title: '追踪失败事件',
              createdAt: new Date('2026-08-24T01:30:00.000Z'),
              missingData: ['缺少来源'],
              riskNotes: ['需要复核'],
              confidence: 'low',
              status: 'suggested',
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = new OverviewService(prisma);

    const result = await service.getOverview({
      range: '7d',
      now: new Date('2026-08-25T00:00:00.000Z'),
    });

    expect(result.stats.publishedCount).toBe(2);
    expect(result.stats.publishedAccounts).toBe(2);
    expect(result.stats.totalViews).toBe(2000);
    expect(result.stats.totalInteractions).toBe(29);
    expect(result.stats.wellPerformingCount).toBe(1);
    expect(result.stats.wellPerformingRate).toBe(0.5);
    expect(result.stats.avgFirstPublishLatencyMs).toBe(75 * 60 * 1000);
    expect(result.accountPerformance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: 'predx',
          name: '@PredX',
          score: 100,
        }),
      ]),
    );
    expect(result.manualItems).toEqual([
      expect.objectContaining({
        eventId: 'event_2',
        actionPage: 'events',
      }),
    ]);
    expect(result.anomalies).toEqual([
      expect.objectContaining({
        type: '追踪异常',
        count: 1,
        actionPage: 'insights',
      }),
    ]);
    expect(result.trend).toHaveLength(1);
  });
});

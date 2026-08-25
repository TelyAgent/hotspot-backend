import { InsightsService } from '../../../src/performance/insights/insights.service';
import { PrismaService } from '../../../src/database/prisma.service';

describe('InsightsService', () => {
  it('aggregates published posts and latest metric snapshots for insights', async () => {
    const prisma = {
      publishedPost: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'post_1',
              contentTaskId: 'hotspot_operation:event_1',
              accountId: 'predx',
              accountName: '@PredX',
              platform: 'x',
              url: 'https://x.com/a/status/1',
              publishedAt: new Date('2026-08-24T00:00:00.000Z'),
              trackingStatus: 'active',
              metricSnapshots: [
                {
                  id: 'metric_2',
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
              contentTaskId: 'content_task_account_a',
              accountId: null,
              accountName: null,
              platform: 'x',
              url: 'https://x.com/a/status/2',
              publishedAt: new Date('2026-08-24T01:00:00.000Z'),
              trackingStatus: 'failed',
              metricSnapshots: [
                {
                  id: 'metric_3',
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
    } as unknown as PrismaService;
    const service = new InsightsService(prisma);

    const result = await service.getInsights({
      range: '7d',
      now: new Date('2026-08-25T00:00:00.000Z'),
    });

    expect(result.stats.trackingPosts).toBe(1);
    expect(result.stats.trackingErrorPosts).toBe(1);
    expect(result.stats.totalViews).toBe(2000);
    expect(result.stats.totalLikes).toBe(20);
    expect(result.stats.wellPerformingRate).toBe(0.5);
    expect(result.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: 'predx',
          name: '@PredX',
          publishedPosts: 1,
          avgViews: 2000,
          wellPerformingRate: 1,
        }),
      ]),
    );
    expect(result.trackingIssues).toEqual([
      expect.objectContaining({
        publicationRecordId: 'post_2',
        lastTrackingError: '接口失败',
        trackingFailureCount: 1,
      }),
    ]);
  });
});

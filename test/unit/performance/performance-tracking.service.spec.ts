import { PerformanceFeedbackService } from '../../../src/performance/feedback/performance-feedback.service';
import { PostMetricSnapshotRepository } from '../../../src/performance/tracking/post-metric-snapshot.repository';
import { PerformanceTrackingService } from '../../../src/performance/tracking/performance-tracking.service';
import { PublishedPostRepository } from '../../../src/performance/tracking/published-post.repository';

describe('PerformanceTrackingService', () => {
  it('backfills a published post and records a metric snapshot', async () => {
    const publishedPostRepository = {
      create: jest.fn((input) =>
        Promise.resolve({
          id: 'ppost_1',
          ...input,
          trackingStatus: 'active',
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          updatedAt: new Date('2026-08-24T10:00:00.000Z'),
        }),
      ),
    } as unknown as PublishedPostRepository;
    const metricSnapshotRepository = {
      create: jest.fn((input) =>
        Promise.resolve({
          id: 'snap_1',
          ...input,
          isMissingData: input.isMissingData ?? false,
          createdAt: new Date('2026-08-24T12:00:00.000Z'),
        }),
      ),
    } as unknown as PostMetricSnapshotRepository;
    const service = new PerformanceTrackingService(
      publishedPostRepository,
      metricSnapshotRepository,
    );

    const post = await service.backfillPublishedPost({
      contentTaskId: 'ctask_1',
      platform: 'x',
      url: 'https://x.com/acct/status/1',
      publishedAt: new Date('2026-08-24T10:00:00.000Z'),
    });
    const snapshot = await service.recordMetricSnapshot({
      publishedPostId: post.id,
      observedAt: new Date('2026-08-24T12:00:00.000Z'),
      views: 1200,
      likes: 30,
    });

    expect(post.trackingStatus).toBe('active');
    expect(snapshot.views).toBe(1200);
  });

  it('uses a two hour delay in the first 24 hours and five hours after that', () => {
    const service = new PerformanceTrackingService(
      {} as PublishedPostRepository,
      {} as PostMetricSnapshotRepository,
    );

    expect(
      service.getNextTrackingDelayHours({
        publishedAt: new Date('2026-08-24T00:00:00.000Z'),
        now: new Date('2026-08-24T12:00:00.000Z'),
      }),
    ).toBe(2);
    expect(
      service.getNextTrackingDelayHours({
        publishedAt: new Date('2026-08-24T00:00:00.000Z'),
        now: new Date('2026-08-25T06:00:00.000Z'),
      }),
    ).toBe(5);
  });

  it('extends tracking when views reach the threshold within the window', () => {
    const service = new PerformanceTrackingService(
      {} as PublishedPostRepository,
      {} as PostMetricSnapshotRepository,
    );

    expect(
      service.shouldExtendTracking({
        publishedAt: new Date('2026-08-24T00:00:00.000Z'),
        snapshot: {
          id: 'snap_1',
          publishedPostId: 'ppost_1',
          observedAt: new Date('2026-08-25T00:00:00.000Z'),
          views: 1200,
          likes: 20,
          replies: null,
          reposts: null,
          quotes: null,
          rawMetrics: null,
          isMissingData: false,
          errorMessage: null,
          createdAt: new Date('2026-08-25T00:00:00.000Z'),
        },
      }),
    ).toBe(true);
  });
});

describe('PerformanceFeedbackService', () => {
  it('creates good performance feedback when views pass the threshold', () => {
    const service = new PerformanceFeedbackService();

    const feedback = service.createFeedback({
      publishedPostId: 'ppost_1',
      snapshot: {
        id: 'snap_1',
        publishedPostId: 'ppost_1',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
        views: 1200,
        likes: 20,
        replies: null,
        reposts: null,
        quotes: null,
        rawMetrics: null,
        isMissingData: false,
        errorMessage: null,
        createdAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(feedback.feedbackType).toBe('good_performance');
    expect(feedback.evidence.views).toBe(1200);
  });

  it('creates missing data feedback when metrics are unavailable', () => {
    const service = new PerformanceFeedbackService();

    const feedback = service.createFeedback({
      publishedPostId: 'ppost_1',
      snapshot: {
        id: 'snap_1',
        publishedPostId: 'ppost_1',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
        views: null,
        likes: null,
        replies: null,
        reposts: null,
        quotes: null,
        rawMetrics: null,
        isMissingData: true,
        errorMessage: 'API failed',
        createdAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(feedback.feedbackType).toBe('missing_data');
    expect(feedback.evidence.errorMessage).toBe('API failed');
  });
});

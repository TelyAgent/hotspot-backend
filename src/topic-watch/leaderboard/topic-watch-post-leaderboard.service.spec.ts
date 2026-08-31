import { Signal } from '../../signal/signal/signal.types';
import { TopicWatchPostLeaderboardService } from './topic-watch-post-leaderboard.service';

describe('TopicWatchPostLeaderboardService', () => {
  it('deduplicates repeated post snapshots, keeps latest metrics, and sorts by views', async () => {
    const repository = {
      listSignalsForTopicWatch: jest.fn().mockResolvedValue([
        createSignal({
          id: 'sig_old',
          postId: 'post_1',
          authorHandle: 'Polymarket',
          text: 'Old snapshot',
          observedAt: new Date('2026-08-26T06:00:00.000Z'),
          publishedAt: '2026-08-26T05:00:00.000Z',
          metrics: { views: 1000, likes: 10, replies: 1, reposts: 2 },
        }),
        createSignal({
          id: 'sig_latest',
          postId: 'post_1',
          authorHandle: 'Polymarket',
          text: 'Latest snapshot',
          observedAt: new Date('2026-08-26T08:00:00.000Z'),
          publishedAt: '2026-08-26T05:00:00.000Z',
          metrics: { views: 3000, likes: 30, replies: 3, reposts: 6 },
        }),
        createSignal({
          id: 'sig_2',
          postId: 'post_2',
          authorHandle: 'Kalshi',
          text: 'Second post',
          observedAt: new Date('2026-08-26T08:00:00.000Z'),
          publishedAt: '2026-08-26T07:00:00.000Z',
          metrics: { views: 5000, likes: 20, replies: 2, reposts: 4 },
        }),
      ]),
    };
    const service = new TopicWatchPostLeaderboardService(repository as never);

    const result = await service.getTopicLeaderboard({
      topicWatchId: 'topic-prediction-market',
      topicWatchName: '预测市场行业',
      observedAt: new Date('2026-08-26T09:00:00.000Z'),
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.postId)).toEqual(['post_2', 'post_1']);
    expect(result.items[1]).toEqual(
      expect.objectContaining({
        signalId: 'sig_latest',
        text: 'Latest snapshot',
        metrics: expect.objectContaining({
          views: 3000,
          likes: 30,
          replies: 3,
          reposts: 6,
        }),
      }),
    );
  });

  it('falls back to the latest available 24h window when the current window has no posts', async () => {
    const historicalSignal = createSignal({
      id: 'sig_historical',
      postId: 'post_historical',
      authorHandle: 'OpenAI',
      text: 'Historical post',
      observedAt: new Date('2026-08-26T08:00:00.000Z'),
      publishedAt: '2026-08-26T07:30:00.000Z',
      metrics: { views: 12000, likes: 40, replies: 5, reposts: 8 },
    });
    const repository = {
      listSignalsForTopicWatch: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([historicalSignal])
        .mockResolvedValueOnce([historicalSignal]),
    };
    const service = new TopicWatchPostLeaderboardService(repository as never);

    const result = await service.getTopicLeaderboard({
      topicWatchId: 'topic-ai-tech',
      topicWatchName: 'AI 与科技',
      observedAt: new Date('2026-08-31T08:00:00.000Z'),
    });

    expect(repository.listSignalsForTopicWatch).toHaveBeenCalledTimes(3);
    expect(result.windowEndAt).toBe('2026-08-26T08:00:00.000Z');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        signalId: 'sig_historical',
        postId: 'post_historical',
      }),
    );
  });
});

function createSignal(input: {
  id: string;
  postId: string;
  authorHandle: string;
  text: string;
  observedAt: Date;
  publishedAt: string;
  metrics: Signal['metrics'];
}): Signal {
  return {
    id: input.id,
    rawItemId: `raw_${input.id}`,
    source: 'x',
    platform: 'x',
    signalType: 'x_post',
    title: `${input.authorHandle}：${input.text}`,
    summary: input.text,
    observedAt: input.observedAt,
    rawRefs: [`raw_${input.id}`],
    metrics: input.metrics,
    metadata: {
      topicWatchId: 'topic-prediction-market',
      postId: input.postId,
      authorHandle: input.authorHandle,
      authorName: input.authorHandle,
      postType: 'original',
      publishedAt: input.publishedAt,
      url: `https://x.com/${input.authorHandle}/status/${input.postId}`,
    },
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
  };
}

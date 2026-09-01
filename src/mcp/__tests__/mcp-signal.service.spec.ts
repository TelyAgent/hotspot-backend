import { McpSignalService } from '../mcp-signal.service';

describe('McpSignalService', () => {
  it('returns semantic signal list items', async () => {
    const repository = {
      findManyForMcp: jest.fn().mockResolvedValue([
        {
          id: 'sig_1',
          rawItemId: 'raw_1',
          signalType: 'topic_watch_post',
          source: 'topic_watch',
          platform: 'x',
          title: 'Polymarket 讨论预测市场',
          summary: 'Polymarket 发布了预测市场相关帖子。',
          observedAt: new Date('2026-08-31T10:05:00.000Z'),
          rawRefs: { url: 'https://x.com/Polymarket/status/1' },
          metrics: { views: 428000 },
          metadata: {
            linkedEventIds: ['event_1'],
            authorHandle: 'Polymarket',
            publishedAt: '2026-08-31T10:00:00.000Z',
          },
          createdAt: new Date('2026-08-31T10:05:00.000Z'),
          updatedAt: new Date('2026-08-31T10:05:00.000Z'),
        },
      ]),
    };
    const service = new McpSignalService(repository as never);

    const result = await service.searchSignals({ limit: 5 });

    expect(result).toEqual([
      {
        signalId: 'sig_1',
        signalType: 'topic_watch_post',
        platform: 'x',
        sourceName: 'Polymarket',
        title: 'Polymarket 讨论预测市场',
        summary: 'Polymarket 发布了预测市场相关帖子。',
        url: 'https://x.com/Polymarket/status/1',
        publishedAt: '2026-08-31T10:00:00.000Z',
        observedAt: '2026-08-31T10:05:00.000Z',
        metrics: { views: 428000 },
        linkedEventIds: ['event_1'],
      },
    ]);
  });
});

import { McpHotEventService } from '../mcp-hot-event.service';

describe('McpHotEventService', () => {
  it('returns semantic hot event list items with capped limit', async () => {
    const repository = {
      listEventsForMcp: jest.fn().mockResolvedValue([
        {
          id: 'event_1',
          title: 'OpenAI 发布新 API',
          summary: 'OpenAI 官方发布新 API，行业账号开始讨论。',
          labels: [
            { name: 'X Trend', category: 'source' },
            { name: 'Top5', category: 'trigger' },
            { name: 'AI', category: 'domain' },
          ],
          confidence: 'high',
          status: 'suggested',
          evidenceRefs: ['evi_1', 'evi_2'],
          missingData: [],
          riskNotes: [],
          occurredAt: new Date('2026-08-31T10:00:00.000Z'),
          createdAt: new Date('2026-08-31T10:05:00.000Z'),
          updatedAt: new Date('2026-08-31T10:06:00.000Z'),
          sourceSummary: { triggerReason: '首次进入 X 热搜前 5。' },
        },
      ]),
    };
    const service = new McpHotEventService(repository as never);

    const result = await service.searchHotEvents({ limit: 100 });

    expect(repository.listEventsForMcp).toHaveBeenCalledWith({
      query: undefined,
      domains: undefined,
      sources: undefined,
      labels: undefined,
      since: undefined,
      limit: 50,
    });
    expect(result).toEqual([
      {
        eventId: 'event_1',
        title: 'OpenAI 发布新 API',
        summary: 'OpenAI 官方发布新 API，行业账号开始讨论。',
        domains: ['AI'],
        sourceLabels: ['X Trend'],
        heatLabels: ['Top5'],
        triggerReason: '首次进入 X 热搜前 5。',
        confidence: 'high',
        status: 'suggested',
        evidenceCount: 2,
        occurredAt: '2026-08-31T10:00:00.000Z',
        observedAt: '2026-08-31T10:05:00.000Z',
        updatedAt: '2026-08-31T10:06:00.000Z',
      },
    ]);
  });

  it('returns event detail with evidence and prompt context', async () => {
    const repository = {
      findEventForMcp: jest.fn().mockResolvedValue({
        id: 'event_1',
        title: 'OpenAI 发布新 API',
        summary: 'OpenAI 官方发布新 API。',
        labels: [{ name: 'AI' }, { name: 'X Trend' }],
        confidence: 'high',
        status: 'suggested',
        evidenceRefs: ['evi_1'],
        missingData: [],
        riskNotes: ['不要把市场概率写成事实。'],
        occurredAt: new Date('2026-08-31T10:00:00.000Z'),
        createdAt: new Date('2026-08-31T10:05:00.000Z'),
        updatedAt: new Date('2026-08-31T10:06:00.000Z'),
        sourceSummary: { triggerReason: '首次进入 X 热搜前 5。' },
      }),
      listEvidenceForMcp: jest.fn().mockResolvedValue([
        {
          id: 'evi_1',
          sourceType: 'x_post',
          sourceTool: 'x',
          claim: 'OpenAI 官方发布新 API。',
          text: 'OpenAI announces a new API.',
          url: 'https://x.com/OpenAI/status/1',
          author: 'OpenAI',
          publishedAt: new Date('2026-08-31T10:00:00.000Z'),
          observedAt: new Date('2026-08-31T10:05:00.000Z'),
          metrics: { views: 10000 },
          confidence: 'high',
        },
      ]),
    };
    const service = new McpHotEventService(repository as never);

    const detail = await service.getHotEventDetail({ eventId: 'event_1' });

    expect(detail.event.title).toBe('OpenAI 发布新 API');
    expect(detail.evidence[0]).toMatchObject({
      evidenceId: 'evi_1',
      source: 'x_post',
      authorName: 'OpenAI',
      url: 'https://x.com/OpenAI/status/1',
    });
    expect(detail.promptContext).toContain('【事件】');
    expect(detail.promptContext).toContain('OpenAI 发布新 API');
  });
});

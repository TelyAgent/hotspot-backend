import { ConfigService } from '@nestjs/config';
import { XTrendsPlugin } from '../../../src/data-source/plugins/x-trends/x-trends.plugin';

describe('XTrendsPlugin', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('collects x trend items and normalizes them into signal evidence', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            trends: [
              {
                trend: {
                  name: 'OpenAI',
                  target: {
                    query: 'OpenAI',
                  },
                  rank: 1,
                  meta_description: '12K posts',
                },
              },
            ],
          }),
      } as Response),
    );

    const plugin = new XTrendsPlugin({
      get: jest.fn((key: string) =>
        key === 'TWITTERAPI_IO_KEY'
          ? 'test-key'
          : key === 'TWITTERAPI_BASE_URL'
            ? 'https://example.test'
            : undefined,
      ),
    } as unknown as ConfigService);

    const result = await plugin.collect({
      capabilityId: 'x.trends.list',
      params: {
        region: 'United States',
        limit: 30,
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'x.trends.list',
        observedAt: new Date('2026-08-24T10:00:00.000Z'),
      },
    });

    expect(result.rawItems).toHaveLength(1);
    expect(result.rawItems[0]).toEqual(
      expect.objectContaining({
        source: 'x',
        sourceType: 'x_trend',
        sourceItemId: 'United States:1:OpenAI',
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test/twitter/trends?woeid=23424977&count=30',
      {
        headers: {
          'X-API-Key': 'test-key',
        },
      },
    );

    const normalized = await plugin.normalize({
      rawItem: {
        id: 'raw_1',
        ...result.rawItems[0],
        observedAtBucket: new Date('2026-08-24T10:00:00.000Z'),
        dedupeKey: 'x:x_trend:United States:1:OpenAI:2026-08-24T10:00:00.000Z',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'x.trends.list',
        observedAt: new Date('2026-08-24T10:00:00.000Z'),
      },
    });

    expect(normalized?.signal).toEqual(
      expect.objectContaining({
        signalType: 'x_trend',
        title: 'OpenAI',
        platform: 'x',
      }),
    );
    expect(normalized?.evidence?.[0]).toEqual(
      expect.objectContaining({
        sourceItemId: 'United States:1:OpenAI',
        url: 'https://x.com/search?q=OpenAI',
      }),
    );
  });
});

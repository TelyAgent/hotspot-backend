import { ConfigService } from '@nestjs/config';
import { YoutubeVideosPlugin } from '../../../src/data-source/plugins/youtube-videos/youtube-videos.plugin';

describe('YoutubeVideosPlugin', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('collects YouTube videos from trending categories and keyword search', async () => {
    global.fetch = jest.fn((url: string) => {
      const parsed = new URL(url);
      const resource = parsed.pathname.split('/').at(-1);

      if (resource === 'videos' && parsed.searchParams.get('chart') === 'mostPopular') {
        return okResponse({
          items: [
            {
              id: 'trend_1',
              snippet: {
                title: 'Trending AI video',
                channelTitle: 'AI Channel',
                channelId: 'channel_1',
                publishedAt: '2026-08-24T10:00:00.000Z',
                thumbnails: { high: { url: 'https://img.test/trend.jpg' } },
              },
              statistics: {
                viewCount: '1000',
                likeCount: '100',
                commentCount: '10',
              },
            },
          ],
        });
      }

      if (resource === 'search') {
        return okResponse({
          items: [
            {
              id: { videoId: 'keyword_1' },
              snippet: {
                title: 'Prediction market video',
                channelTitle: 'Market Channel',
                channelId: 'channel_2',
                publishedAt: '2026-08-24T11:00:00.000Z',
              },
            },
          ],
        });
      }

      return okResponse({
        items: [
          {
            id: 'trend_1',
            snippet: {
              title: 'Trending AI video',
              channelTitle: 'AI Channel',
              channelId: 'channel_1',
              publishedAt: '2026-08-24T10:00:00.000Z',
              thumbnails: { high: { url: 'https://img.test/trend.jpg' } },
            },
            statistics: {
              viewCount: '1000',
              likeCount: '100',
              commentCount: '10',
            },
            contentDetails: {
              duration: 'PT8M',
            },
          },
          {
            id: 'keyword_1',
            snippet: {
              title: 'Prediction market video',
              channelTitle: 'Market Channel',
              channelId: 'channel_2',
              publishedAt: '2026-08-24T11:00:00.000Z',
            },
            statistics: {
              viewCount: '2000',
              likeCount: '120',
              commentCount: '20',
            },
            contentDetails: {
              duration: 'PT6M',
            },
          },
        ],
      });
    }) as unknown as typeof fetch;

    const plugin = new YoutubeVideosPlugin({
      get: jest.fn((key: string) =>
        key === 'YOUTUBE_API_KEY' ? 'youtube-key' : undefined,
      ),
    } as unknown as ConfigService);

    const result = await plugin.collect({
      capabilityId: 'youtube.videos.discover',
      params: {
        categories: ['28'],
        keywords: ['prediction market'],
        perCategoryLimit: 1,
        perKeywordLimit: 1,
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'youtube.videos.discover',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(result.rawItems).toHaveLength(2);
    expect(result.rawItems[0]).toEqual(
      expect.objectContaining({
        source: 'youtube',
        sourceType: 'youtube_video',
        sourceItemId: 'trend_1',
      }),
    );

    const normalized = await plugin.normalize({
      rawItem: {
        id: 'raw_1',
        ...result.rawItems[1],
        observedAtBucket: new Date('2026-08-25T00:00:00.000Z'),
        dedupeKey: 'youtube:youtube_video:keyword_1:2026-08-25T00:00:00.000Z',
        createdAt: new Date('2026-08-25T00:00:00.000Z'),
        updatedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'youtube.videos.discover',
        observedAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    });

    expect(normalized?.signal).toEqual(
      expect.objectContaining({
        signalType: 'youtube_video',
        title: 'Prediction market video',
        platform: 'youtube',
        metrics: expect.objectContaining({
          viewCount: 2000,
          likeCount: 120,
          commentCount: 20,
        }),
      }),
    );
    expect(normalized?.evidence?.[0]).toEqual(
      expect.objectContaining({
        sourceType: 'youtube_video',
        sourceItemId: 'keyword_1',
        url: 'https://www.youtube.com/watch?v=keyword_1',
      }),
    );
  });
});

function okResponse(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

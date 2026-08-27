import { ConfigService } from '@nestjs/config';
import { XAccountPostsPlugin } from '../../../src/data-source/plugins/x-account-posts/x-account-posts.plugin';

describe('XAccountPostsPlugin', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('collects account posts and normalizes them into post signals', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/twitter/user/info')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'success',
              data: {
                id: 'user_123',
                userName: 'OpenAI',
                name: 'OpenAI',
              },
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'success',
            tweets: [
              {
                id: 'post_1',
                text: 'Introducing a new model for developers.',
                url: 'https://x.com/OpenAI/status/post_1',
                createdAt: '2026-08-24T10:00:00.000Z',
                author: {
                  id: 'user_123',
                  userName: 'OpenAI',
                  name: 'OpenAI',
                },
                likeCount: 12,
                retweetCount: 3,
                replyCount: 2,
                quoteCount: 1,
                viewCount: 4000,
                bookmarkCount: 5,
              },
            ],
          }),
      } as Response);
    }) as unknown as typeof fetch;

    const plugin = new XAccountPostsPlugin({
      get: jest.fn((key: string) =>
        key === 'TWITTERAPI_IO_KEY'
          ? 'test-key'
          : key === 'TWITTERAPI_BASE_URL'
            ? 'https://example.test'
            : undefined,
      ),
    } as unknown as ConfigService);

    const result = await plugin.collect({
      capabilityId: 'x.account.posts',
      params: {
        handle: 'OpenAI',
        topicWatchId: 'topic_ai',
        since: '2026-08-24T09:00:00.000Z',
        until: '2026-08-24T11:00:00.000Z',
        maxPages: 1,
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'x.account.posts',
        observedAt: new Date('2026-08-24T11:00:00.000Z'),
      },
    });

    expect(result.rawItems).toHaveLength(1);
    expect(result.rawItems[0]).toEqual(
      expect.objectContaining({
        source: 'x',
        sourceType: 'x_account_post',
        sourceItemId: 'post_1',
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test/twitter/user/info?userName=OpenAI',
      {
        headers: {
          'X-API-Key': 'test-key',
        },
      },
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test/twitter/user/tweet_timeline?userId=user_123&includeReplies=true',
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
        observedAtBucket: new Date('2026-08-24T11:00:00.000Z'),
        dedupeKey: 'x:x_account_post:post_1:2026-08-24T11:00:00.000Z',
        createdAt: new Date('2026-08-24T11:00:00.000Z'),
        updatedAt: new Date('2026-08-24T11:00:00.000Z'),
      },
      context: {
        jobId: 'job_1',
        capabilityId: 'x.account.posts',
        observedAt: new Date('2026-08-24T11:00:00.000Z'),
      },
    });

    expect(normalized?.signal).toEqual(
      expect.objectContaining({
        signalType: 'x_post',
        title: 'OpenAI：Introducing a new model for developers.',
        platform: 'x',
        metrics: expect.objectContaining({
          views: 4000,
          likes: 12,
          reposts: 3,
          replies: 2,
          quotes: 1,
          bookmarks: 5,
        }),
      }),
    );
    expect(normalized?.evidence?.[0]).toEqual(
      expect.objectContaining({
        sourceType: 'x_account_post',
        sourceItemId: 'post_1',
        url: 'https://x.com/OpenAI/status/post_1',
        text: 'Introducing a new model for developers.',
        publishedAt: new Date('2026-08-24T10:00:00.000Z'),
      }),
    );
  });
});

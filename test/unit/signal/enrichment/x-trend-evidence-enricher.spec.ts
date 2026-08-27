import { ConfigService } from '@nestjs/config';
import { XTrendEvidenceEnricher } from '../../../../src/signal/enrichment/x-trend-evidence-enricher';

describe('XTrendEvidenceEnricher', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('creates related post evidence from twitterapi.io advanced search', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: jest.fn(() =>
          Promise.resolve({
            tweets: [
              {
                id: 'post_1',
                url: 'https://x.com/OpenAI/status/post_1',
                text: 'OpenAI 发布新的 API 更新，引发开发者讨论。',
                createdAt: '2026-08-27T00:00:00.000Z',
                viewCount: 10000,
                likeCount: 500,
                retweetCount: 20,
                replyCount: 30,
                quoteCount: 5,
                author: {
                  userName: 'OpenAI',
                  name: 'OpenAI',
                },
              },
            ],
          }),
        ),
      } as unknown as Response),
    ) as never;
    const prisma = {
      evidenceItem: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        create: jest.fn(() => Promise.resolve({ id: 'ev_post_1' })),
      },
    };
    const enricher = new XTrendEvidenceEnricher(
      prisma as never,
      createConfig({
        TWITTERAPI_IO_KEY: 'test-key',
      }),
    );

    await enricher.enrich({
      signal: {
        id: 'sig_x_trend',
        signalType: 'x_trend',
        title: 'OpenAI',
        metadata: {
          query: 'OpenAI',
        },
      },
      mode: 'before_opportunity_mining',
      maxEvidence: 3,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.twitterapi.io/twitter/tweet/advanced_search?query=OpenAI&queryType=Top',
      expect.objectContaining({
        headers: {
          'X-API-Key': 'test-key',
        },
      }),
    );
    expect(prisma.evidenceItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signalId: 'sig_x_trend',
          sourceType: 'x_trend_related_post',
          sourceItemId: 'post_1',
          author: 'OpenAI',
          url: 'https://x.com/OpenAI/status/post_1',
          text: 'OpenAI 发布新的 API 更新，引发开发者讨论。',
          confidence: 'medium',
        }),
      }),
    );
  });
});

function createConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

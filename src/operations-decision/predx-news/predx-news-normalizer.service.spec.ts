import { PredxNewsNormalizerService } from './predx-news-normalizer.service';

describe('PredxNewsNormalizerService', () => {
  it('normalizes latest-news API item into an internal PredX news item', () => {
    const service = new PredxNewsNormalizerService();

    const item = service.normalize({
      fact_id: 246227,
      event_id: 50992,
      event_title: "US, China debate 'nonsensitive' tariff cuts ahead of summit",
      news_title: 'US, China debate tariff cuts ahead of Trump-Xi summit',
      news_source: 'nikkei',
      news_url: 'https://example.com/news',
      news_published_at: '2026-09-01T02:57:35Z',
      fact_latest_time: '2026-09-01T02:57:35Z',
      fact_category: 'fiscal_trade_policy',
      primary_market_title: 'US x China tariff agreement by December 31?',
      primary_market_url: 'https://polymarket.com/event/us-x-china-tariff-agreement-by-december-31',
      associated_market_display_score: 0.6071,
      related_markets: [
        {
          market_name: 'US x China tariff agreement by December 31?',
          outcome_yes_price: 0.883,
        },
      ],
    });

    expect(item).toMatchObject({
      externalId: 'fact:246227',
      title: "US, China debate 'nonsensitive' tariff cuts ahead of summit",
      sourceName: 'nikkei',
      sourceUrl: 'https://example.com/news',
      primaryMarketTitle: 'US x China tariff agreement by December 31?',
      primaryMarketUrl: 'https://polymarket.com/event/us-x-china-tariff-agreement-by-december-31',
    });
    expect(item.publishedAt.toISOString()).toBe('2026-09-01T02:57:35.000Z');
    expect(item.raw).toEqual(expect.objectContaining({ fact_id: 246227 }));
  });
});

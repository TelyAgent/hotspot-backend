import { buildYoutubeBoardStats } from './youtube.service';

describe('buildYoutubeBoardStats', () => {
  it('counts today board videos and recognizes youtube_trending as official source', () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const stats = buildYoutubeBoardStats([
      {
        observedAt: today.toISOString(),
        selectionSources: [{ type: 'youtube_trending', label: 'YouTube 官方热门' }],
        matchedKeywords: [],
        analysis: { main_reason: {} },
      },
      {
        observedAt: today.toISOString(),
        selectionSources: [{ type: 'keyword_search', label: '关键词 · web3' }],
        matchedKeywords: ['web3'],
        analysis: null,
      },
      {
        observedAt: yesterday.toISOString(),
        selectionSources: [{ type: 'youtube_trending', label: 'YouTube 官方热门' }],
        matchedKeywords: ['politics'],
        analysis: { main_reason: {} },
      },
    ]);

    expect(stats).toEqual({
      todayNew: 2,
      officialVideos: 1,
      keywordVideos: 1,
      analyzedVideos: 2,
    });
  });
});

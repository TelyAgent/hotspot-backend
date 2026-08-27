import { YoutubeTranscriptEvidenceEnricher } from '../../../../src/signal/enrichment/youtube-transcript-evidence-enricher';

describe('YoutubeTranscriptEvidenceEnricher', () => {
  it('creates transcript analysis evidence when a video has successful analysis', async () => {
    const prisma = {
      youtubeVideoAnalysis: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            signalId: 'sig_youtube',
            videoId: 'video_1',
            status: 'success',
            transcriptLanguage: 'en',
            result: {
              main_reason: {
                topic: '预测市场解释',
                why_attractive: '用案例解释复杂主题。',
                traffic_judgment: '标题和热点关键词带来点击。',
              },
              execution: {
                key_technique: '先给冲突，再解释机制。',
                effect: '降低理解门槛。',
              },
              replication: {
                reusable_mechanism: '热点解释框架。',
                product_remix_topic: '用产品解释预测市场机会。',
                product_entry: '从用户决策成本切入。',
              },
              limitations: [],
            },
          }),
        ),
      },
      evidenceItem: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        create: jest.fn(() => Promise.resolve({ id: 'ev_analysis' })),
      },
    };
    const enricher = new YoutubeTranscriptEvidenceEnricher(prisma as never);

    await enricher.enrich({
      signal: {
        id: 'sig_youtube',
        signalType: 'youtube_video',
        title: 'Why prediction markets work',
        metadata: {
          url: 'https://www.youtube.com/watch?v=video_1',
        },
      },
      mode: 'before_opportunity_mining',
    });

    expect(prisma.evidenceItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          signalId: 'sig_youtube',
          sourceType: 'youtube_transcript_analysis',
          sourceItemId: 'video_1',
          claim: expect.stringContaining('预测市场解释'),
          text: expect.stringContaining('用案例解释复杂主题'),
          url: 'https://www.youtube.com/watch?v=video_1',
          confidence: 'medium',
        }),
      }),
    );
  });
});

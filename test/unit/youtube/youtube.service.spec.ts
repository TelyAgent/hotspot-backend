import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { PrismaService } from '../../../src/database/prisma.service';
import { YoutubeAnalysisService } from '../../../src/youtube/youtube-analysis.service';
import { YoutubeService } from '../../../src/youtube/youtube.service';

describe('YoutubeService', () => {
  it('analyzes all collected youtube videos after collection succeeds', async () => {
    const collectionRunner = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'run_1',
          status: 'succeeded',
          rawItemCount: 2,
          outputSummary: {
            officialCount: 1,
            keywordCount: 1,
            signalCount: 2,
          },
          startedAt: new Date('2026-08-25T00:00:00.000Z'),
          finishedAt: new Date('2026-08-25T00:00:01.000Z'),
          errorMessage: null,
        }),
      ),
    } as unknown as CollectionRunnerService;
    const prisma = {
      collectionRun: {
        findFirst: jest.fn(),
      },
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            createYoutubeSignal('signal_1', 'video_1'),
            createYoutubeSignal('signal_2', 'video_2'),
          ]),
        ),
      },
    } as unknown as PrismaService;
    const analysis = {
      analyzeMissing: jest.fn(() => Promise.resolve({ analyzed: 2, skipped: 0, failed: 0 })),
    } as unknown as YoutubeAnalysisService;
    const service = new YoutubeService(collectionRunner, prisma, analysis);

    await service.run();

    expect(analysis.analyzeMissing).toHaveBeenCalledWith({ limit: 50 });
  });

  it('returns analysis status and result in the youtube board', async () => {
    const collectionRunner = {} as unknown as CollectionRunnerService;
    const prisma = {
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              ...createYoutubeSignal('signal_1', 'video_1'),
              youtubeVideoAnalyses: [
                {
                  status: 'success',
                  transcriptStatus: 'available',
                  result: {
                    main_reason: {
                      topic: '这个视频讲了一个具体热点。',
                      why_attractive: '它抓住了用户正在关心的冲突。',
                      traffic_judgment: '第一驱动力是选题本身。',
                    },
                    execution: {
                      key_technique: '开头先抛出强问题。',
                      effect: '让观众快速理解矛盾。',
                    },
                    replication: {
                      reusable_mechanism: '把复杂议题压缩成一个可讨论问题。',
                      product_remix_topic: '围绕产品使用场景做二创。',
                      product_entry: '从用户真实困惑切入。',
                    },
                    limitations: ['仅基于字幕和公开指标。'],
                  },
                  errorMessage: null,
                },
              ],
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = new YoutubeService(
      collectionRunner,
      prisma,
      {} as unknown as YoutubeAnalysisService,
    );

    const board = await service.board();

    expect(board.videos[0]).toEqual(
      expect.objectContaining({
        videoId: 'video_1',
        analysisStatus: 'success',
        transcriptStatus: 'available',
        analysis: expect.objectContaining({
          mainReason: expect.objectContaining({
            topic: '这个视频讲了一个具体热点。',
          }),
        }),
      }),
    );
  });
});

function createYoutubeSignal(id: string, videoId: string) {
  return {
    id,
    title: `Video ${videoId}`,
    observedAt: new Date('2026-08-25T00:00:00.000Z'),
    platform: 'youtube',
    signalType: 'youtube_video',
    metrics: {
      viewCount: 100,
      likeCount: 10,
      commentCount: 1,
    },
    metadata: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: null,
      channelId: 'channel_1',
      channelTitle: 'Channel',
      publishedAt: '2026-08-24T00:00:00.000Z',
      duration: 'PT1M',
      selectionSources: [],
      matchedKeywords: [],
      keywordHitCount: 0,
      discoveryLabels: [],
    },
  };
}

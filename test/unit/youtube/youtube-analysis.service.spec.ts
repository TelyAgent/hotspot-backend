import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma.service';
import { YoutubeAnalysisService } from '../../../src/youtube/youtube-analysis.service';
import { YoutubeTranscriptExtractor } from '../../../src/youtube/youtube-transcript.extractor';

describe('YoutubeAnalysisService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the dedicated youtube analysis model when configured', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        createResponse({
          output_text: JSON.stringify({
            main_reason: {
              topic: '这个视频讲了一个热点。',
              why_attractive: '它把用户关注的冲突讲清楚。',
              traffic_judgment: '第一驱动力是选题本身。',
            },
            execution: {
              key_technique: '用问题开头。',
              effect: '快速建立观看动机。',
            },
            replication: {
              reusable_mechanism: '把复杂议题变成一个具体问题。',
              product_remix_topic: '结合产品场景做二创选题。',
              product_entry: '从用户真实问题自然进入产品。',
            },
            limitations: ['仅基于字幕和公开指标。'],
          }),
        }),
      ),
    ) as never;
    const prisma = {
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'signal_1',
              title: 'Video',
              metrics: {},
              metadata: {
                videoId: 'video_1',
                url: 'https://www.youtube.com/watch?v=video_1',
              },
            },
          ]),
        ),
      },
      youtubeVideoAnalysis: {
        findUnique: jest.fn(() => Promise.resolve(null)),
        upsert: jest.fn(() => Promise.resolve({ id: 'analysis_1' })),
        update: jest.fn(() => Promise.resolve({})),
      },
    } as unknown as PrismaService;
    const extractor = {
      extract: jest.fn(() =>
        Promise.resolve({
          status: 'available',
          provider: 'test',
          language: 'en',
          segments: [],
          plainText: 'hello world',
        }),
      ),
    } as unknown as YoutubeTranscriptExtractor;
    const service = new YoutubeAnalysisService(
      prisma,
      createConfig({
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'global-test-model',
        YOUTUBE_ANALYSIS_MODEL: 'gpt-4o-mini',
      }),
      extractor,
    );

    await service.analyzeMissing();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        body: expect.stringContaining('"model":"gpt-4o-mini"'),
      }),
    );
  });
});

function createConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function createResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn(() => Promise.resolve(payload)),
  } as unknown as Response;
}

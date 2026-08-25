import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { JsonObject, JsonValue } from '../common/types/json.type';
import { PrismaService } from '../database/prisma.service';
import { YoutubeAnalysisOutput, YoutubeTranscriptResult } from './youtube-analysis.types';
import { YoutubeTranscriptExtractor } from './youtube-transcript.extractor';

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

const DEFAULT_ANALYSIS_LIMIT = 50;
const DEFAULT_TRANSCRIPT_MAX_CHARS = 60000;
const DEFAULT_ANALYSIS_CONCURRENCY = 1;
const DEFAULT_MODEL_TIMEOUT_MS = 45000;

@Injectable()
export class YoutubeAnalysisService {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly transcriptExtractor: YoutubeTranscriptExtractor,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model =
      this.configService.get<string>('YOUTUBE_ANALYSIS_MODEL') ??
      this.configService.get<string>('OPENAI_MODEL') ??
      'gpt-4o-mini';
    this.baseUrl =
      this.configService.get<string>('OPENAI_BASE_URL') ??
      'https://api.openai.com/v1';
  }

  async analyzeMissing(input: { limit?: number } = {}) {
    const limit = input.limit ?? DEFAULT_ANALYSIS_LIMIT;
    const signals = await this.prisma.signal.findMany({
      where: {
        platform: 'youtube',
        signalType: 'youtube_video',
        youtubeVideoAnalyses: {
          none: {
            status: {
              in: ['running', 'success'],
            },
          },
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
      take: limit,
    });

    let analyzed = 0;
    let skipped = 0;
    let failed = 0;

    const results = await mapWithConcurrency(
      signals,
      this.getAnalysisConcurrency(),
      (signal) => this.analyzeSignal(signal),
    );

    for (const result of results) {
      if (result === 'success') analyzed += 1;
      if (result === 'skipped') skipped += 1;
      if (result === 'failed') failed += 1;
    }

    return {
      analyzed,
      skipped,
      failed,
    };
  }

  private getAnalysisConcurrency() {
    const value = this.configService.get<string>('YOUTUBE_ANALYSIS_CONCURRENCY');
    if (!value) return DEFAULT_ANALYSIS_CONCURRENCY;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ANALYSIS_CONCURRENCY;
    return Math.min(parsed, 5);
  }

  async analyzeByVideoId(videoId: string) {
    const signal = await this.prisma.signal.findFirst({
      where: {
        platform: 'youtube',
        signalType: 'youtube_video',
        metadata: {
          path: ['videoId'],
          equals: videoId,
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
    });

    if (!signal) {
      throw new DomainError('YouTube video signal not found.', 'YOUTUBE_VIDEO_NOT_FOUND', {
        videoId,
      });
    }

    await this.prisma.youtubeVideoAnalysis.deleteMany({
      where: {
        signalId: signal.id,
      },
    });

    await this.analyzeSignal(signal);
    return this.prisma.youtubeVideoAnalysis.findUnique({
      where: {
        signalId: signal.id,
      },
    });
  }

  private async analyzeSignal(signal: {
    id: string;
    title: string;
    metrics?: Prisma.JsonValue | null;
    metadata?: Prisma.JsonValue | null;
  }): Promise<'success' | 'skipped' | 'failed'> {
    const metadata = isRecord(signal.metadata) ? signal.metadata : {};
    const videoId = getString(metadata.videoId);
    const videoUrl = getString(metadata.url) ?? (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

    if (!videoId || !videoUrl) {
      await this.saveFailure(signal.id, videoId ?? signal.id, '缺少 YouTube 视频 ID 或链接');
      return 'failed';
    }

    const existingAnalysis = await this.prisma.youtubeVideoAnalysis.findUnique({
      where: {
        signalId: signal.id,
      },
    });
    const analysis = await this.prisma.youtubeVideoAnalysis.upsert({
      where: {
        signalId: signal.id,
      },
      create: {
        id: `youtube_analysis_${randomUUID()}`,
        signalId: signal.id,
        videoId,
        status: 'running',
        startedAt: new Date(),
      },
      update: {
        videoId,
        status: 'running',
        errorMessage: null,
        startedAt: new Date(),
        finishedAt: null,
      },
    });

    const transcript =
      getReusableTranscript(existingAnalysis) ??
      await this.transcriptExtractor.extract({ videoId, videoUrl });
    await this.prisma.youtubeVideoAnalysis.update({
      where: { id: analysis.id },
      data: {
        transcriptStatus: transcript.status,
        transcriptProvider: transcript.provider,
        transcriptLanguage: transcript.language,
        transcriptText: transcript.status === 'available' ? transcript.plainText : null,
        transcriptSegments:
          transcript.status === 'available'
            ? (transcript.segments as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        errorMessage: transcript.status === 'available' ? null : transcript.errorMessage,
      },
    });

    if (transcript.status !== 'available') {
      await this.prisma.youtubeVideoAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: transcript.status,
          finishedAt: new Date(),
        },
      });
      return 'skipped';
    }

    try {
      const output = await this.generateChineseAnalysis({
        signal,
        metadata,
        transcript,
      });
      await this.prisma.youtubeVideoAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: 'success',
          result: output as unknown as Prisma.InputJsonValue,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      return 'success';
    } catch (error) {
      await this.prisma.youtubeVideoAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: 'analysis_failed',
          errorMessage: error instanceof Error ? error.message : 'YouTube 字幕拆解失败',
          finishedAt: new Date(),
        },
      });
      return 'failed';
    }
  }

  private async saveFailure(signalId: string, videoId: string, errorMessage: string) {
    await this.prisma.youtubeVideoAnalysis.upsert({
      where: {
        signalId,
      },
      create: {
        id: `youtube_analysis_${randomUUID()}`,
        signalId,
        videoId,
        status: 'analysis_failed',
        errorMessage,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      update: {
        videoId,
        status: 'analysis_failed',
        errorMessage,
        finishedAt: new Date(),
      },
    });
  }

  private async generateChineseAnalysis(input: {
    signal: {
      title: string;
      metrics?: Prisma.JsonValue | null;
    };
    metadata: Record<string, unknown>;
    transcript: YoutubeTranscriptResult;
  }): Promise<YoutubeAnalysisOutput> {
    if (!this.apiKey) {
      throw new DomainError('OPENAI_API_KEY is required for YouTube analysis.', 'OPENAI_API_KEY_NOT_CONFIGURED');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getModelTimeoutMs());

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: this.createPrompt(input),
          max_output_tokens: 900,
          text: {
            format: {
              type: 'json_object',
            },
          },
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DomainError('YouTube analysis model request timed out.', 'YOUTUBE_ANALYSIS_MODEL_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => null)) as OpenAiResponse | null;
    if (!response.ok) {
      throw new DomainError(
        payload?.error?.message ?? 'OpenAI Responses API request failed.',
        'YOUTUBE_ANALYSIS_MODEL_REQUEST_FAILED',
        {
          status: response.status,
        },
      );
    }

    const output = this.parseOutput(extractOutputText(payload));
    return this.validate(output);
  }

  private createPrompt(input: {
    signal: {
      title: string;
      metrics?: Prisma.JsonValue | null;
    };
    metadata: Record<string, unknown>;
    transcript: YoutubeTranscriptResult;
  }) {
    return [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: [
              '你是面向运营人员的 YouTube 爆款视频字幕拆解 Agent。',
              '你只基于输入中的标题、公开指标、入选来源、频道信息和字幕文本分析。',
              '不要推断完播率、留存曲线、流量来源、推荐流、转化率等后台不可见指标。',
              '所有输出必须使用简体中文。即使字幕是英文、俄文或其他语言，也必须用简体中文输出。',
              '只能输出严格 JSON，不要输出 Markdown。',
              'JSON 格式必须是：',
              '{"main_reason":{"topic":"视频具体讲了什么","why_attractive":"为什么吸引用户","traffic_judgment":"唯一第一流量驱动力，以及账号因素是否足以解释播放量"},"execution":{"key_technique":"最关键的一到两个字幕可见手法","effect":"这些手法如何放大选题或维持注意力"},"replication":{"reusable_mechanism":"可迁移的底层机制","product_remix_topic":"结合产品的具体二创选题","product_entry":"产品从哪个问题、冲突或真实场景自然进入"},"limitations":["仅基于字幕和公开指标，未使用画面、音频、留存或流量来源数据"]}',
            ].join('\n'),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              video: {
                video_id: getString(input.metadata.videoId),
                video_url: getString(input.metadata.url),
                title: input.signal.title,
                published_at: getString(input.metadata.publishedAt) ?? null,
                duration: getString(input.metadata.duration) ?? null,
              },
              discovery: {
                selection_sources: input.metadata.selectionSources ?? [],
                matched_keywords: input.metadata.matchedKeywords ?? [],
                keyword_hit_count: input.metadata.keywordHitCount ?? 0,
                discovery_labels: input.metadata.discoveryLabels ?? [],
              },
              video_metrics: input.signal.metrics ?? null,
              channel: {
                channel_id: getString(input.metadata.channelId) ?? null,
                channel_title: getString(input.metadata.channelTitle) ?? null,
                subscriber_count: null,
              },
              transcript: {
                language: input.transcript.language,
                plain_text: truncateTranscript(input.transcript.plainText),
              },
              product_profile: null,
            }),
          },
        ],
      },
    ];
  }

  private getModelTimeoutMs() {
    const value = this.configService.get<string>('YOUTUBE_ANALYSIS_MODEL_TIMEOUT_MS');
    if (!value) return DEFAULT_MODEL_TIMEOUT_MS;

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MODEL_TIMEOUT_MS;
  }

  private parseOutput(text: string): unknown {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      throw new DomainError('YouTube analysis model returned invalid JSON.', 'YOUTUBE_ANALYSIS_INVALID_JSON', {
        text,
      });
    }
  }

  private validate(output: unknown): YoutubeAnalysisOutput {
    const normalized = normalizeAnalysisOutput(output);
    if (!isRecord(normalized)) {
      throw new DomainError('YouTube analysis output must be an object.', 'YOUTUBE_ANALYSIS_INVALID_OUTPUT');
    }

    const value = normalized as unknown as YoutubeAnalysisOutput;
    const requiredStrings = [
      value.main_reason?.topic,
      value.main_reason?.why_attractive,
      value.main_reason?.traffic_judgment,
      value.execution?.key_technique,
      value.execution?.effect,
      value.replication?.reusable_mechanism,
      value.replication?.product_remix_topic,
      value.replication?.product_entry,
      ...(Array.isArray(value.limitations) ? value.limitations : []),
    ];

    if (!requiredStrings.every((item) => typeof item === 'string' && item.trim())) {
      throw new DomainError('YouTube analysis output shape is invalid.', 'YOUTUBE_ANALYSIS_INVALID_OUTPUT');
    }

    const chineseCharCount = requiredStrings
      .join('')
      .split('')
      .filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
    if (chineseCharCount < 12) {
      throw new DomainError('YouTube analysis output must be Chinese.', 'YOUTUBE_ANALYSIS_NOT_CHINESE');
    }

    return value;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function normalizeAnalysisOutput(output: unknown): unknown {
  if (!isRecord(output)) {
    return output;
  }

  return {
    main_reason: output.main_reason ?? output.mainReason,
    execution: output.execution,
    replication: output.replication,
    limitations: output.limitations,
  };
}

function getReusableTranscript(
  analysis:
    | {
        transcriptStatus: string | null;
        transcriptProvider: string | null;
        transcriptLanguage: string | null;
        transcriptText: string | null;
        transcriptSegments: Prisma.JsonValue | null;
      }
    | null,
): YoutubeTranscriptResult | null {
  if (
    analysis?.transcriptStatus !== 'available' ||
    !analysis.transcriptText?.trim()
  ) {
    return null;
  }

  return {
    status: 'available',
    provider: analysis.transcriptProvider ?? 'stored',
    language: analysis.transcriptLanguage,
    plainText: analysis.transcriptText,
    segments: Array.isArray(analysis.transcriptSegments)
      ? analysis.transcriptSegments
          .filter(isRecord)
          .map((segment) => ({
            startMs: typeof segment.startMs === 'number' ? segment.startMs : 0,
            durationMs:
              typeof segment.durationMs === 'number' ? segment.durationMs : null,
            text: typeof segment.text === 'string' ? segment.text : '',
          }))
          .filter((segment) => segment.text.trim())
      : [],
  };
}

function extractOutputText(payload: OpenAiResponse | null): string {
  if (payload?.output_text) {
    return payload.output_text;
  }

  const text = payload?.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((value): value is string => typeof value === 'string');

  if (!text) {
    throw new DomainError('OpenAI model response did not contain text output.', 'YOUTUBE_ANALYSIS_OUTPUT_MISSING');
  }

  return text;
}

function truncateTranscript(text: string) {
  return text.length > DEFAULT_TRANSCRIPT_MAX_CHARS
    ? `${text.slice(0, DEFAULT_TRANSCRIPT_MAX_CHARS)}\n[字幕过长，已截断]`
    : text;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

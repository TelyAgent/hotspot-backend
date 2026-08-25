import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CollectionRunnerService } from '../data-source/runner/collection-runner.service';
import { YoutubeAnalysisService } from './youtube-analysis.service';

@Injectable()
export class YoutubeService {
  constructor(
    private readonly collectionRunner: CollectionRunnerService,
    private readonly prisma: PrismaService,
    private readonly analysisService: YoutubeAnalysisService,
  ) {}

  async run() {
    const run = await this.collectionRunner.run({
      id: `youtube_discover_${randomUUID()}`,
      pluginId: 'youtube-videos',
      capabilityId: 'youtube.videos.discover',
      params: {},
      observedAt: new Date(),
    });

    const summary = isRecord(run.outputSummary) ? run.outputSummary : {};
    const analysisSummary =
      run.status === 'succeeded'
        ? await this.analysisService.analyzeMissing({ limit: 50 })
        : { analyzed: 0, skipped: 0, failed: 0 };

    return {
      id: run.id,
      runDate: run.startedAt.toISOString(),
      status: run.status === 'succeeded' ? 'success' : run.status,
      officialCount: getNumber(summary.officialCount, 0),
      keywordCount: getNumber(summary.keywordCount, 0),
      newVideoCount: getNumber(summary.signalCount, run.rawItemCount),
      historicalCount: run.rawItemCount,
      analysisSummary,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  async latestRun() {
    const run = await this.prisma.collectionRun.findFirst({
      where: {
        pluginId: 'youtube-videos',
        capabilityId: 'youtube.videos.discover',
      },
      orderBy: {
        startedAt: 'desc',
      },
    });
    if (!run) return null;
    const summary = isRecord(run.outputSummary) ? run.outputSummary : {};

    return {
      id: run.id,
      runDate: run.startedAt.toISOString(),
      status: run.status === 'succeeded' ? 'success' : run.status,
      officialCount: getNumber(summary.officialCount, 0),
      keywordCount: getNumber(summary.keywordCount, 0),
      newVideoCount: getNumber(summary.signalCount, run.rawItemCount),
      historicalCount: run.rawItemCount,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  async board() {
    const signals = await this.prisma.signal.findMany({
      where: {
        platform: 'youtube',
        signalType: 'youtube_video',
      },
      orderBy: {
        observedAt: 'desc',
      },
      include: {
        youtubeVideoAnalyses: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
      take: 50,
    });

    return {
      videos: signals.map((signal) => {
        const metadata = isRecord(signal.metadata) ? signal.metadata : {};
        const metrics = isRecord(signal.metrics) ? signal.metrics : {};
        const videoId = getString(metadata.videoId) ?? signal.id;
        const latestAnalysis = signal.youtubeVideoAnalyses[0] ?? null;
        const analysisResult = isRecord(latestAnalysis?.result)
          ? latestAnalysis.result
          : null;

        return {
          videoId,
          title: signal.title,
          url: getString(metadata.url) ?? `https://www.youtube.com/watch?v=${videoId}`,
          thumbnailUrl: getNullableString(metadata.thumbnailUrl),
          channelTitle: getNullableString(metadata.channelTitle),
          publishedAt: getNullableString(metadata.publishedAt),
          consecutiveHotDays: 1,
          boardVisibleUntil: new Date(signal.observedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          selectionSources: Array.isArray(metadata.selectionSources)
            ? metadata.selectionSources
            : [],
          matchedKeywords: Array.isArray(metadata.matchedKeywords)
            ? metadata.matchedKeywords.filter((item): item is string => typeof item === 'string')
            : [],
          keywordHitCount: getNumber(metadata.keywordHitCount, 0),
          discoveryLabels: Array.isArray(metadata.discoveryLabels)
            ? metadata.discoveryLabels.filter((item): item is string => typeof item === 'string')
            : [],
          videoMetrics: {
            viewCount: getNullableNumber(metrics.viewCount),
            likeCount: getNullableNumber(metrics.likeCount),
            commentCount: getNullableNumber(metrics.commentCount),
          },
          analysisStatus: latestAnalysis?.status ?? null,
          transcriptStatus: latestAnalysis?.transcriptStatus ?? null,
          analysis: analysisResult
            ? {
                mainReason: analysisResult.main_reason ?? null,
                execution: analysisResult.execution ?? null,
                replication: analysisResult.replication ?? null,
                limitations: Array.isArray(analysisResult.limitations)
                  ? analysisResult.limitations
                  : [],
              }
            : null,
        };
      }),
    };
  }

  analyzeVideo(videoId: string) {
    return this.analysisService.analyzeByVideoId(videoId);
  }

  analyzeMissing() {
    return this.analysisService.analyzeMissing({ limit: 50 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getNullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  SignalEvidenceEnricher,
  SignalEvidenceEnricherInput,
} from './signal-evidence-enrichment.types';

@Injectable()
export class YoutubeTranscriptEvidenceEnricher implements SignalEvidenceEnricher {
  constructor(private readonly prisma: PrismaService) {}

  supports(signalType: string): boolean {
    return signalType === 'youtube_video';
  }

  async enrich(input: SignalEvidenceEnricherInput): Promise<void> {
    const analysis = await this.prisma.youtubeVideoAnalysis.findUnique({
      where: {
        signalId: input.signal.id,
      },
    });
    if (!analysis || analysis.status !== 'success' || !analysis.result) {
      return;
    }

    const result = normalizeAnalysisResult(analysis.result);
    const sourceItemId = analysis.videoId;
    const existing = await this.prisma.evidenceItem.findFirst({
      where: {
        signalId: input.signal.id,
        sourceType: 'youtube_transcript_analysis',
        sourceItemId,
      },
    });
    const data = {
      signalId: input.signal.id,
      sourceType: 'youtube_transcript_analysis',
      sourceItemId,
      claim: `YouTube 视频「${input.signal.title}」已有字幕拆解：${result.topic}。`,
      text: result.text,
      url: getMetadataString(input.signal.metadata, 'url'),
      observedAt: new Date(),
      confidence: 'medium',
      metadata: {
        transcriptLanguage: analysis.transcriptLanguage,
        generatedFrom: 'youtube_video_analyses',
      } satisfies Prisma.InputJsonObject,
    };

    if (existing) {
      await this.prisma.evidenceItem.update({
        where: {
          id: existing.id,
        },
        data,
      });
      return;
    }

    await this.prisma.evidenceItem.create({
      data,
    });
  }
}

function normalizeAnalysisResult(value: Prisma.JsonValue): {
  topic: string;
  text: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      topic: '视频内容拆解',
      text: '该视频已有字幕拆解结果。',
    };
  }

  const record = value as Record<string, unknown>;
  const mainReason = getRecord(record.main_reason);
  const execution = getRecord(record.execution);
  const replication = getRecord(record.replication);
  const topic = getString(mainReason.topic) ?? '视频内容拆解';
  const parts = [
    `主题：${topic}`,
    `为什么吸引人：${getString(mainReason.why_attractive) ?? '暂无'}`,
    `流量判断：${getString(mainReason.traffic_judgment) ?? '暂无'}`,
    `制作方式：${getString(execution.key_technique) ?? '暂无'}`,
    `可复用机制：${getString(replication.reusable_mechanism) ?? '暂无'}`,
    `产品承接：${getString(replication.product_entry) ?? '暂无'}`,
  ];

  return {
    topic,
    text: parts.join('\n'),
  };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  return getString((metadata as Record<string, unknown>)[key]);
}

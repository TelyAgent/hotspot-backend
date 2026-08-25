import { Injectable } from '@nestjs/common';
import { fetchTranscript, type TranscriptResponse } from 'youtube-transcript';
import {
  YoutubeTranscriptResult,
  YoutubeTranscriptSegment,
} from './youtube-analysis.types';

@Injectable()
export class YoutubeTranscriptExtractor {
  async extract(input: { videoId: string; videoUrl: string }): Promise<YoutubeTranscriptResult> {
    try {
      const rows = await fetchTranscript(input.videoUrl || input.videoId);
      const normalized = normalizeYoutubeTranscriptRows(rows);

      if (normalized.segments.length === 0) {
        return {
          status: 'transcript_unavailable',
          provider: 'youtube-transcript',
          language: null,
          segments: [],
          plainText: '',
          errorMessage: '未提取到可用字幕文本',
        };
      }

      return {
        status: 'available',
        provider: 'youtube-transcript',
        ...normalized,
      };
    } catch (error) {
      return {
        status: classifyTranscriptError(error),
        provider: 'youtube-transcript',
        language: null,
        segments: [],
        plainText: '',
        errorMessage: error instanceof Error ? error.message : '字幕提取失败',
      };
    }
  }
}

export function normalizeYoutubeTranscriptRows(rows: TranscriptResponse[]) {
  const segments = rows
    .map((row) => ({
      startMs: Math.round(row.offset * 1000),
      durationMs: Number.isFinite(row.duration) ? Math.round(row.duration * 1000) : null,
      text: row.text.trim(),
      language: row.lang ?? null,
    }))
    .filter((row) => row.text.length > 0);

  return {
    language: segments.find((segment) => segment.language)?.language ?? null,
    segments: segments.map(
      ({ startMs, durationMs, text }): YoutubeTranscriptSegment => ({
        startMs,
        durationMs,
        text,
      }),
    ),
    plainText: segments.map((segment) => segment.text).join('\n'),
  };
}

function classifyTranscriptError(error: unknown): 'transcript_unavailable' | 'content_unavailable' {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    message.includes('unavailable') ||
    message.includes('disabled') ||
    message.includes('not available')
  ) {
    return 'transcript_unavailable';
  }

  return 'content_unavailable';
}

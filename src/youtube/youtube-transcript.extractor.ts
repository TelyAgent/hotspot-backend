import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchTranscript, type TranscriptResponse } from 'youtube-transcript';
import {
  YoutubeTranscriptResult,
  YoutubeTranscriptSegment,
} from './youtube-analysis.types';

const execFileAsync = promisify(execFile);

@Injectable()
export class YoutubeTranscriptExtractor {
  constructor(private readonly configService: ConfigService) {}

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
      const fallback = await extractWithYtDlp(input, this.getYtDlpOptions());
      if (fallback.status === 'available') {
        return fallback;
      }

      const primaryMessage = error instanceof Error ? error.message : '字幕提取失败';
      return {
        status: fallback.status === 'content_unavailable'
          ? fallback.status
          : classifyTranscriptError(error),
        provider: fallback.provider,
        language: null,
        segments: [],
        plainText: '',
        errorMessage: [primaryMessage, fallback.errorMessage].filter(Boolean).join('；'),
      };
    }
  }

  private getYtDlpOptions(): YtDlpTranscriptOptions {
    return {
      impersonate: getOptionalConfig(this.configService, 'YOUTUBE_YTDLP_IMPERSONATE'),
      cookiesPath: getOptionalConfig(this.configService, 'YOUTUBE_COOKIES_PATH'),
      cookiesFromBrowser: getOptionalConfig(this.configService, 'YOUTUBE_COOKIES_FROM_BROWSER'),
    };
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

async function extractWithYtDlp(input: {
  videoId: string;
  videoUrl: string;
}, options: YtDlpTranscriptOptions): Promise<YoutubeTranscriptResult> {
  const workdir = await mkdtemp(join(tmpdir(), 'hotspot-youtube-transcript-'));
  const outputTemplate = join(workdir, `subtitle-${input.videoId}`);
  try {
    await execFileAsync('yt-dlp', [
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs',
      'zh.*,zh,en.*,en,ja.*,ja,ko.*,ko,id.*,id,es.*,es,ru.*,ru',
      '--sub-format',
      'vtt',
      ...buildYtDlpAuthAndImpersonationArgs(options),
      '-o',
      outputTemplate,
      input.videoUrl || `https://www.youtube.com/watch?v=${input.videoId}`,
    ]);

    const files = await readdir(workdir);
    const subtitleFile = files.find((file) => file.endsWith('.vtt'));
    if (!subtitleFile) {
      return {
        status: 'transcript_unavailable',
        provider: 'yt-dlp',
        language: null,
        segments: [],
        plainText: '',
        errorMessage: 'yt-dlp 未下载到可用字幕文件',
      };
    }

    const content = await readFile(join(workdir, subtitleFile), 'utf8');
    const normalized = normalizeVttTranscript(content, inferLanguageFromSubtitleFile(subtitleFile));
    if (normalized.segments.length === 0) {
      return {
        status: 'transcript_unavailable',
        provider: 'yt-dlp',
        language: null,
        segments: [],
        plainText: '',
        errorMessage: 'yt-dlp 字幕文件没有可用文本',
      };
    }

    return {
      status: 'available',
      provider: 'yt-dlp',
      ...normalized,
    };
  } catch (error) {
    return {
      status: classifyTranscriptError(error),
      provider: 'yt-dlp',
      language: null,
      segments: [],
      plainText: '',
      errorMessage: error instanceof Error ? normalizeYtDlpError(error.message) : 'yt-dlp 字幕提取失败',
    };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

type YtDlpTranscriptOptions = {
  impersonate?: string;
  cookiesPath?: string;
  cookiesFromBrowser?: string;
};

function buildYtDlpAuthAndImpersonationArgs(options: YtDlpTranscriptOptions) {
  const args: string[] = [];
  if (options.impersonate) {
    args.push('--impersonate', options.impersonate);
  }
  if (options.cookiesPath) {
    args.push('--cookies', options.cookiesPath);
  } else if (options.cookiesFromBrowser) {
    args.push('--cookies-from-browser', options.cookiesFromBrowser);
  }
  return args;
}

export function normalizeVttTranscript(vtt: string, language: string | null) {
  const blocks = vtt
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments = blocks.flatMap((block): YoutubeTranscriptSegment[] => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) return [];

    const timing = lines[timingIndex];
    const [startRaw, endRaw] = timing.split('-->').map((part) => part.trim().split(/\s+/)[0]);
    const startMs = parseVttTimestamp(startRaw);
    const endMs = parseVttTimestamp(endRaw);
    const text = lines
      .slice(timingIndex + 1)
      .filter((line) => !line.startsWith('<') && !line.startsWith('NOTE'))
      .map(stripVttMarkup)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || startMs === null) return [];

    return [{
      startMs,
      durationMs: endMs === null ? null : Math.max(0, endMs - startMs),
      text,
    }];
  });

  const dedupedSegments = segments.filter((segment, index) =>
    index === 0 || segment.text !== segments[index - 1]?.text,
  );

  return {
    language,
    segments: dedupedSegments,
    plainText: dedupedSegments.map((segment) => segment.text).join('\n'),
  };
}

function classifyTranscriptError(error: unknown): 'transcript_unavailable' | 'content_unavailable' {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('captcha') ||
    message.includes('rate limit')
  ) {
    return 'content_unavailable';
  }

  if (
    message.includes('unavailable') ||
    message.includes('disabled') ||
    message.includes('not available')
  ) {
    return 'transcript_unavailable';
  }

  return 'content_unavailable';
}

function inferLanguageFromSubtitleFile(file: string) {
  const match = file.match(/\.([a-z]{2,3}(?:-[A-Za-z]+)?)\.vtt$/);
  return match?.[1] ?? null;
}

function parseVttTimestamp(value: string | undefined) {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const [hoursRaw, minutesRaw, secondsRaw] =
    parts.length === 3 ? parts : ['0', parts[0], parts[1]];
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

function stripVttMarkup(line: string) {
  return line
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeYtDlpError(message: string) {
  if (message.includes('429') || message.toLowerCase().includes('too many requests')) {
    return 'YouTube 字幕下载被限流：HTTP 429 Too Many Requests';
  }
  return message;
}

function getOptionalConfig(configService: ConfigService, key: string) {
  const value = configService.get<string>(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

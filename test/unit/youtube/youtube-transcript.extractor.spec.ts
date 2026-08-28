import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { ConfigService } from '@nestjs/config';
import { fetchTranscript } from 'youtube-transcript';
import { YoutubeTranscriptExtractor } from '../../../src/youtube/youtube-transcript.extractor';

jest.mock('youtube-transcript', () => ({
  fetchTranscript: jest.fn(),
}));

jest.mock('node:child_process', () => ({
  execFile: jest.fn(),
}));

describe('YoutubeTranscriptExtractor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to yt-dlp subtitles when the primary transcript package fails', async () => {
    jest.mocked(fetchTranscript).mockRejectedValue(new Error('Transcript is disabled'));
    jest.mocked(execFile).mockImplementation((((
      _file: string,
      args: readonly string[],
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const outputIndex = (args as string[]).indexOf('-o');
      const outputTemplate = (args as string[])[outputIndex + 1];
      const outputFile = outputTemplate.replace('%(id)s', 'video_1').replace('%(ext)s', 'vtt');
      void writeFile(
        `${outputFile}.en.vtt`,
        [
          'WEBVTT',
          '',
          '00:00:00.000 --> 00:00:02.000',
          'This is the first line.',
          '',
          '00:00:02.000 --> 00:00:04.500',
          'This is the second line.',
        ].join('\n'),
      ).then(() => callback(null, '', ''));
      return {} as never;
    }) as unknown) as typeof execFile);

    const result = await new YoutubeTranscriptExtractor(createConfig({})).extract({
      videoId: 'video_1',
      videoUrl: 'https://www.youtube.com/watch?v=video_1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'available',
        provider: 'yt-dlp',
        language: 'en',
        plainText: 'This is the first line.\nThis is the second line.',
      }),
    );
  });

  it('passes impersonation and cookies options to yt-dlp when configured', async () => {
    jest.mocked(fetchTranscript).mockRejectedValue(new Error('Transcript is disabled'));
    jest.mocked(execFile).mockImplementation((((
      _file: string,
      args: readonly string[],
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const outputIndex = (args as string[]).indexOf('-o');
      const outputTemplate = (args as string[])[outputIndex + 1];
      const outputFile = outputTemplate.replace('%(id)s', 'video_2').replace('%(ext)s', 'vtt');
      void writeFile(
        `${outputFile}.en.vtt`,
        [
          'WEBVTT',
          '',
          '00:00:00.000 --> 00:00:02.000',
          'Configured extraction.',
        ].join('\n'),
      ).then(() => callback(null, '', ''));
      return {} as never;
    }) as unknown) as typeof execFile);

    await new YoutubeTranscriptExtractor(createConfig({
      YOUTUBE_YTDLP_IMPERSONATE: 'chrome',
      YOUTUBE_COOKIES_PATH: '/tmp/youtube-cookies.txt',
    })).extract({
      videoId: 'video_2',
      videoUrl: 'https://www.youtube.com/watch?v=video_2',
    });

    expect(execFile).toHaveBeenCalledWith(
      'yt-dlp',
      expect.arrayContaining([
        '--impersonate',
        'chrome',
        '--cookies',
        '/tmp/youtube-cookies.txt',
      ]),
      expect.any(Function),
    );
  });
});

function createConfig(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

import { ConfigService } from '@nestjs/config';
import { YoutubeSchedulerService } from '../../../src/youtube/youtube-scheduler.service';
import { YoutubeService } from '../../../src/youtube/youtube.service';

describe('YoutubeSchedulerService', () => {
  it('runs youtube collection when there is no previous run', async () => {
    const youtube = {
      latestRun: jest.fn(() => Promise.resolve(null)),
      run: jest.fn(() =>
        Promise.resolve({
          id: 'youtube_run_1',
          status: 'success',
          newVideoCount: 2,
        }),
      ),
    } as unknown as YoutubeService;
    const scheduler = new YoutubeSchedulerService(
      {
        get: jest.fn((key: string) =>
          key === 'YOUTUBE_COLLECTION_INTERVAL_MS' ? '86400000' : undefined,
        ),
      } as unknown as ConfigService,
      youtube,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T10:00:00.000Z'));

    expect(youtube.run).toHaveBeenCalledTimes(1);
  });

  it('does not run again before configured interval has elapsed', async () => {
    const youtube = {
      latestRun: jest.fn(() =>
        Promise.resolve({
          startedAt: '2026-08-25T09:30:00.000Z',
        }),
      ),
      run: jest.fn(),
    } as unknown as YoutubeService;
    const scheduler = new YoutubeSchedulerService(
      {
        get: jest.fn((key: string) =>
          key === 'YOUTUBE_COLLECTION_INTERVAL_MS' ? '86400000' : undefined,
        ),
      } as unknown as ConfigService,
      youtube,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T10:00:00.000Z'));

    expect(youtube.run).not.toHaveBeenCalled();
  });
});

import { YoutubeController } from '../../../src/youtube/youtube.controller';
import { YoutubeService } from '../../../src/youtube/youtube.service';

describe('YoutubeController', () => {
  it('runs youtube collection', async () => {
    const service = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'run_1',
          status: 'succeeded',
          newVideoCount: 2,
        }),
      ),
    } as unknown as YoutubeService;
    const controller = new YoutubeController(service);

    const result = await controller.run();

    expect(service.run).toHaveBeenCalled();
    expect(result.newVideoCount).toBe(2);
  });
});

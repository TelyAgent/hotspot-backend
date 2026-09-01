import { ConfigService } from '@nestjs/config';
import { OperationRecommendationSchedulerService } from './operation-recommendation-scheduler.service';

describe('OperationRecommendationSchedulerService', () => {
  it('runs recommendations only after the three-hour interval is due', async () => {
    const recommendationService = {
      generate: jest.fn().mockResolvedValue({
        generatedCount: 1,
        syncedPredxNewsCount: 4,
      }),
    };
    const scheduler = new OperationRecommendationSchedulerService(
      new ConfigService(),
      recommendationService as never,
    );

    await scheduler.runDueRecommendations(new Date('2026-09-01T00:00:00.000Z'));
    await scheduler.runDueRecommendations(new Date('2026-09-01T02:59:59.000Z'));
    await scheduler.runDueRecommendations(new Date('2026-09-01T03:00:00.000Z'));

    expect(recommendationService.generate).toHaveBeenCalledTimes(2);
    expect(recommendationService.generate).toHaveBeenCalledWith({
      eventTake: 50,
      newsTake: 20,
    });
  });

  it('skips a tick while a scheduled recommendation run is still running', async () => {
    let resolveRun: () => void = () => undefined;
    const recommendationService = {
      generate: jest.fn(
        () =>
          new Promise((resolve) => {
            resolveRun = () => resolve({
              generatedCount: 1,
              syncedPredxNewsCount: 4,
            });
          }),
      ),
    };
    const scheduler = new OperationRecommendationSchedulerService(
      new ConfigService(),
      recommendationService as never,
    );

    const firstTick = scheduler.tick(new Date('2026-09-01T00:00:00.000Z'));
    await scheduler.tick(new Date('2026-09-01T03:00:00.000Z'));
    resolveRun();
    await firstTick;

    expect(recommendationService.generate).toHaveBeenCalledTimes(1);
  });
});

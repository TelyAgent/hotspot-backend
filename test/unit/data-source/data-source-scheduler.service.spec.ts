import { ConfigService } from '@nestjs/config';
import { DataSourceSchedulerService } from '../../../src/data-source/scheduler/data-source-scheduler.service';
import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';

describe('DataSourceSchedulerService', () => {
  it('uses project config when running the scheduled X trends collection', async () => {
    const runner = {
      run: jest.fn(() => ({
        id: 'run_1',
        status: 'succeeded',
        rawItemCount: 1,
      })),
    } as unknown as CollectionRunnerService;
    const projectConfig = {
      getXTrendCollectionConfig: jest.fn(() => ({
        regions: ['Japan'],
        limit: 12,
        collectionIntervalMs: 1000,
      })),
    } as unknown as ProjectConfigService;
    const service = new DataSourceSchedulerService(
      {
        get: jest.fn((key: string) =>
          key === 'DATA_SOURCE_SCHEDULER_ENABLED' ? 'false' : undefined,
        ),
      } as unknown as ConfigService,
      runner,
      projectConfig,
    );

    await service.runDueCollection(new Date('2026-08-24T10:00:00.000Z'));

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'x-trends-default',
        pluginId: 'x-trends',
        capabilityId: 'x.trends.list',
        params: expect.objectContaining({
          regions: ['Japan'],
          limit: 12,
        }),
      }),
    );
  });
});

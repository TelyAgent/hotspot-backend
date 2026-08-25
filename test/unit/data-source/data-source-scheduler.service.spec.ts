import { ConfigService } from '@nestjs/config';
import { DataSourceSchedulerService } from '../../../src/data-source/scheduler/data-source-scheduler.service';
import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';
import { CollectionRunRepository } from '../../../src/data-source/runner/collection-run.repository';

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
    const collectionRunRepository = {
      findLatestByPlugin: jest.fn(() => null),
    } as unknown as CollectionRunRepository;
    const service = new DataSourceSchedulerService(
      {
        get: jest.fn((key: string) =>
          key === 'DATA_SOURCE_SCHEDULER_ENABLED' ? 'false' : undefined,
        ),
      } as unknown as ConfigService,
      runner,
      projectConfig,
      collectionRunRepository,
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

  it('skips collection when the latest persisted X trends run is still inside the interval', async () => {
    const runner = {
      run: jest.fn(),
    } as unknown as CollectionRunnerService;
    const projectConfig = {
      getXTrendCollectionConfig: jest.fn(() => ({
        regions: ['global'],
        limit: 30,
        collectionIntervalMs: 2 * 60 * 60 * 1000,
      })),
    } as unknown as ProjectConfigService;
    const collectionRunRepository = {
      findLatestByPlugin: jest.fn(() => ({
        id: 'run_recent',
        pluginId: 'x-trends',
        status: 'succeeded',
        startedAt: new Date('2026-08-25T10:30:00.000Z'),
      })),
    } as unknown as CollectionRunRepository;
    const service = new DataSourceSchedulerService(
      {
        get: jest.fn((key: string) =>
          key === 'DATA_SOURCE_SCHEDULER_ENABLED' ? 'false' : undefined,
        ),
      } as unknown as ConfigService,
      runner,
      projectConfig,
      collectionRunRepository,
    );

    await service.runDueCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(runner.run).not.toHaveBeenCalled();
  });
});

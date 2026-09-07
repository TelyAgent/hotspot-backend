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
        trendCollectionEnabled: true,
        kolRadarEnabled: true,
        kolRadarCollectionIntervalMs: 6 * 60 * 60 * 1000,
        kolRadarAccounts: [
          {
            handle: 'OpenAI',
            groupTag: 'AI / 产品',
            joinedAt: '2026-08-26T06:33:01.015Z',
            enabled: true,
          },
        ],
      })),
    } as unknown as ProjectConfigService;
    const collectionRunRepository = {
      findLatestByPlugin: jest.fn(() => null),
      findByJobIdPrefix: jest.fn(() => []),
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

    await service.runDueTrendCollection(new Date('2026-08-24T10:00:00.000Z'));

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
        trendCollectionEnabled: true,
        kolRadarEnabled: true,
        kolRadarCollectionIntervalMs: 6 * 60 * 60 * 1000,
        kolRadarAccounts: [
          {
            handle: 'OpenAI',
            groupTag: 'AI / 产品',
            joinedAt: '2026-08-26T06:33:01.015Z',
            enabled: true,
          },
        ],
      })),
    } as unknown as ProjectConfigService;
    const collectionRunRepository = {
      findLatestByPlugin: jest.fn(() => ({
        id: 'run_recent',
        pluginId: 'x-trends',
        status: 'succeeded',
        startedAt: new Date('2026-08-25T10:30:00.000Z'),
      })),
      findByJobIdPrefix: jest.fn(() => []),
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

    await service.runDueTrendCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(runner.run).not.toHaveBeenCalled();
  });

  it('skips X trends scheduled collection when project config switch is disabled', async () => {
    const runner = {
      run: jest.fn(),
    } as unknown as CollectionRunnerService;
    const projectConfig = {
      getXTrendCollectionConfig: jest.fn(() => ({
        regions: ['global'],
        limit: 30,
        collectionIntervalMs: 1000,
        trendCollectionEnabled: false,
        kolRadarEnabled: true,
        kolRadarCollectionIntervalMs: 6 * 60 * 60 * 1000,
        kolRadarAccounts: [
          {
            handle: 'OpenAI',
            groupTag: 'AI / 产品',
            joinedAt: '2026-08-26T06:33:01.015Z',
            enabled: true,
          },
        ],
      })),
    } as unknown as ProjectConfigService;
    const collectionRunRepository = {
      findLatestByPlugin: jest.fn(),
      findByJobIdPrefix: jest.fn(),
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

    await service.runDueTrendCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(collectionRunRepository.findLatestByPlugin).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('runs the KOL radar batch on the six hour cadence', async () => {
    const runner = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'kol_run_1',
          status: 'succeeded',
          rawItemCount: 2,
        }),
      ),
    } as unknown as CollectionRunnerService;
    const projectConfig = {
      getXTrendCollectionConfig: jest.fn(() => ({
        regions: ['global'],
        limit: 30,
        collectionIntervalMs: 3 * 60 * 60 * 1000,
        trendCollectionEnabled: true,
        kolRadarEnabled: true,
        kolRadarCollectionIntervalMs: 6 * 60 * 60 * 1000,
        kolRadarAccounts: [
          {
            handle: 'OpenAI',
            groupTag: 'AI / 产品',
            joinedAt: '2026-08-26T06:33:01.015Z',
            enabled: true,
          },
          {
            handle: 'Polymarket',
            groupTag: '预测市场',
            joinedAt: '2026-08-26T06:33:01.077Z',
            enabled: true,
          },
        ],
      })),
    } as unknown as ProjectConfigService;
    const collectionRunRepository = {
      findLatestByPlugin: jest.fn(() => null),
      findByJobIdPrefix: jest.fn(() => []),
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

    await service.runDueKolRadarCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'x-kol-radar-default',
        pluginId: 'x-account-posts',
        capabilityId: 'x.account.posts',
        params: expect.objectContaining({
          handles: ['OpenAI', 'Polymarket'],
        }),
      }),
    );
  });
});

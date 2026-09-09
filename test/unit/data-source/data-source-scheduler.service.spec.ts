import { ConfigService } from '@nestjs/config';
import { AccountMetricsService } from '../../../src/account-profile/account-metrics.service';
import { AccountProfileRefreshService } from '../../../src/account-profile/account-profile-refresh.service';
import { AccountProfileRepository } from '../../../src/account-profile/account-profile.repository';
import { AccountProfileService } from '../../../src/account-profile/account-profile.service';
import { DataSourceSchedulerService } from '../../../src/data-source/scheduler/data-source-scheduler.service';
import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { CollectionRunRepository } from '../../../src/data-source/runner/collection-run.repository';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';

function buildCollectionConfig(overrides: Record<string, unknown> = {}) {
  return {
    regions: ['global'],
    limit: 30,
    collectionIntervalMs: 3 * 60 * 60 * 1000,
    trendCollectionEnabled: true,
    kolRadarEnabled: true,
    kolRadarCollectionIntervalMs: 6 * 60 * 60 * 1000,
    kolRadarMinViews: 10000,
    ...overrides,
  };
}

function buildAccountProfileService(handles: string[]) {
  return {
    listMonitoredHandles: jest.fn(() => Promise.resolve(handles)),
  } as unknown as AccountProfileService;
}

function buildAccountMetricsService() {
  return {
    refreshEngagement: jest.fn(() =>
      Promise.resolve({
        windowDays: 7,
        scannedSignals: 0,
        matchedSignals: 0,
        updated: 0,
        created: 0,
        skippedTombstoned: 0,
        resetStale: 0,
      }),
    ),
  } as unknown as AccountMetricsService;
}

function buildAccountProfileRefreshService() {
  return {
    refreshActiveAccounts: jest.fn(() =>
      Promise.resolve({
        intervalMs: 24 * 60 * 60 * 1000,
        scanned: 0,
        refreshed: 0,
        failed: 0,
        missingKey: false,
        finishedAt: '2026-08-25T11:05:00.000Z',
      }),
    ),
  } as unknown as AccountProfileRefreshService;
}

function buildAccountProfileRepository(lastFetchedAt: Date | null = null) {
  return {
    getMaxLastFetchedAt: jest.fn(() => Promise.resolve(lastFetchedAt)),
  } as unknown as AccountProfileRepository;
}

function buildConfigService() {
  return {
    get: jest.fn((key: string) =>
      key === 'DATA_SOURCE_SCHEDULER_ENABLED' ? 'false' : undefined,
    ),
  } as unknown as ConfigService;
}

type Deps = {
  runner: CollectionRunnerService;
  projectConfig: ProjectConfigService;
  collectionRunRepository: CollectionRunRepository;
  accountProfileService: AccountProfileService;
  accountMetrics: AccountMetricsService;
  accountProfileRefresh: AccountProfileRefreshService;
  accountProfileRepository: AccountProfileRepository;
};

function buildService(deps: Partial<Deps> = {}) {
  return new DataSourceSchedulerService(
    buildConfigService(),
    deps.runner ?? ({ run: jest.fn() } as unknown as CollectionRunnerService),
    deps.projectConfig ?? {
      getXTrendCollectionConfig: jest.fn(() => buildCollectionConfig()),
    } as unknown as ProjectConfigService,
    deps.accountProfileService ?? buildAccountProfileService(['OpenAI']),
    deps.accountMetrics ?? buildAccountMetricsService(),
    deps.accountProfileRefresh ?? buildAccountProfileRefreshService(),
    deps.accountProfileRepository ?? buildAccountProfileRepository(),
    deps.collectionRunRepository ?? {
      findLatestByPlugin: jest.fn(() => null),
      findByJobIdPrefix: jest.fn(() => []),
    } as unknown as CollectionRunRepository,
  );
}

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
      getXTrendCollectionConfig: jest.fn(() =>
        buildCollectionConfig({
          regions: ['Japan'],
          limit: 12,
          collectionIntervalMs: 1000,
        }),
      ),
    } as unknown as ProjectConfigService;
    const service = buildService({ runner, projectConfig });

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
      getXTrendCollectionConfig: jest.fn(() =>
        buildCollectionConfig({ collectionIntervalMs: 2 * 60 * 60 * 1000 }),
      ),
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
    const service = buildService({ runner, projectConfig, collectionRunRepository });

    await service.runDueTrendCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(runner.run).not.toHaveBeenCalled();
  });

  it('skips X trends scheduled collection when project config switch is disabled', async () => {
    const runner = {
      run: jest.fn(),
    } as unknown as CollectionRunnerService;
    const projectConfig = {
      getXTrendCollectionConfig: jest.fn(() =>
        buildCollectionConfig({
          collectionIntervalMs: 1000,
          trendCollectionEnabled: false,
        }),
      ),
    } as unknown as ProjectConfigService;
    const collectionRunRepository = {
      findLatestByPlugin: jest.fn(),
      findByJobIdPrefix: jest.fn(),
    } as unknown as CollectionRunRepository;
    const service = buildService({ runner, projectConfig, collectionRunRepository });

    await service.runDueTrendCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(collectionRunRepository.findLatestByPlugin).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('runs the KOL radar batch with the monitored handles from account profiles', async () => {
    const runner = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'kol_run_1',
          status: 'succeeded',
          rawItemCount: 2,
        }),
      ),
    } as unknown as CollectionRunnerService;
    const service = buildService({
      runner,
      accountProfileService: buildAccountProfileService(['openai', 'polymarket']),
    });

    await service.runDueKolRadarCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'x-kol-radar-default',
        pluginId: 'x-account-posts',
        capabilityId: 'x.account.posts',
        params: expect.objectContaining({
          handles: ['openai', 'polymarket'],
        }),
      }),
    );
  });

  it('skips the KOL radar batch when no monitored account exists', async () => {
    const runner = {
      run: jest.fn(),
    } as unknown as CollectionRunnerService;
    const service = buildService({
      runner,
      accountProfileService: buildAccountProfileService([]),
    });

    await service.runDueKolRadarCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(runner.run).not.toHaveBeenCalled();
  });

  it('triggers engagement refresh after a successful KOL radar collection', async () => {
    const runner = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'kol_run_2',
          status: 'succeeded',
          rawItemCount: 4,
        }),
      ),
    } as unknown as CollectionRunnerService;
    const accountMetrics = buildAccountMetricsService();
    const service = buildService({
      runner,
      accountMetrics,
      accountProfileService: buildAccountProfileService(['openai']),
    });

    await service.runDueKolRadarCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(accountMetrics.refreshEngagement).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger engagement refresh when the KOL radar batch returns no raw items', async () => {
    const runner = {
      run: jest.fn(() =>
        Promise.resolve({
          id: 'kol_run_3',
          status: 'succeeded',
          rawItemCount: 0,
        }),
      ),
    } as unknown as CollectionRunnerService;
    const accountMetrics = buildAccountMetricsService();
    const service = buildService({
      runner,
      accountMetrics,
      accountProfileService: buildAccountProfileService(['openai']),
    });

    await service.runDueKolRadarCollection(new Date('2026-08-25T11:05:00.000Z'));

    expect(accountMetrics.refreshEngagement).not.toHaveBeenCalled();
  });

  it('runs account profile refresh when the latest persisted lastFetchedAt is older than 24h', async () => {
    const accountProfileRefresh = buildAccountProfileRefreshService();
    const accountProfileRepository = buildAccountProfileRepository(
      new Date('2026-08-23T10:00:00.000Z'),
    );
    const service = buildService({ accountProfileRefresh, accountProfileRepository });

    await service.runDueAccountProfileRefresh(new Date('2026-08-25T11:05:00.000Z'));

    expect(accountProfileRefresh.refreshActiveAccounts).toHaveBeenCalledTimes(1);
  });

  it('skips account profile refresh when the latest persisted lastFetchedAt is within 24h', async () => {
    const accountProfileRefresh = buildAccountProfileRefreshService();
    const accountProfileRepository = buildAccountProfileRepository(
      new Date('2026-08-25T10:30:00.000Z'),
    );
    const service = buildService({ accountProfileRefresh, accountProfileRepository });

    await service.runDueAccountProfileRefresh(new Date('2026-08-25T11:05:00.000Z'));

    expect(accountProfileRefresh.refreshActiveAccounts).not.toHaveBeenCalled();
  });

  it('treats the first run as a cold start and runs account profile refresh even without history', async () => {
    const accountProfileRefresh = buildAccountProfileRefreshService();
    const accountProfileRepository = buildAccountProfileRepository(null);
    const service = buildService({ accountProfileRefresh, accountProfileRepository });

    await service.runDueAccountProfileRefresh(new Date('2026-08-25T11:05:00.000Z'));

    expect(accountProfileRefresh.refreshActiveAccounts).toHaveBeenCalledTimes(1);
  });

  it('skips a re-entrant account profile refresh while one is already running', async () => {
    let resolveRefresh!: (value: { scanned: number; refreshed: number; failed: number; missingKey: boolean; finishedAt: string; intervalMs: number }) => void;
    const accountProfileRefresh = {
      refreshActiveAccounts: jest.fn(
        () => new Promise((resolve) => { resolveRefresh = resolve; }),
      ),
    } as unknown as AccountProfileRefreshService;
    const service = buildService({
      accountProfileRefresh,
      accountProfileRepository: buildAccountProfileRepository(null),
    });

    const first = service.runDueAccountProfileRefresh(new Date('2026-08-25T11:05:00.000Z'));
    await service.runDueAccountProfileRefresh(new Date('2026-08-25T11:05:00.000Z'));
    resolveRefresh({
      intervalMs: 24 * 60 * 60 * 1000,
      scanned: 0,
      refreshed: 0,
      failed: 0,
      missingKey: false,
      finishedAt: '2026-08-25T11:05:00.000Z',
    });
    await first;

    expect(accountProfileRefresh.refreshActiveAccounts).toHaveBeenCalledTimes(1);
  }, 10_000);
});

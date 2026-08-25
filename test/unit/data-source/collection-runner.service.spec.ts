import { RawItemService } from '../../../src/signal/raw-item/raw-item.service';
import { EvidenceService } from '../../../src/signal/evidence/evidence.service';
import { SignalService } from '../../../src/signal/signal/signal.service';
import { CollectionRunRepository } from '../../../src/data-source/runner/collection-run.repository';
import { CollectionRunnerService } from '../../../src/data-source/runner/collection-runner.service';
import { DataSourcePluginRegistry } from '../../../src/data-source/registry/data-source-plugin.registry';
import { MockDataSourcePlugin } from '../../../src/data-source/plugins/mock/mock.plugin';
import { XTrendSnapshotService } from '../../../src/data-source/plugins/x-trends/x-trend-snapshot.service';
import { OpportunityMiningSchedulerService } from '../../../src/opportunity/mining/opportunity-mining-scheduler.service';

describe('CollectionRunnerService', () => {
  it('runs a registered plugin and stores raw items', async () => {
    const registry = new DataSourcePluginRegistry();
    registry.register(new MockDataSourcePlugin());

    const collectionRunRepository = {
      createStarted: jest.fn(() => ({
        id: 'run_1',
        jobId: 'job_1',
        pluginId: 'mock',
        capabilityId: 'list-items',
        status: 'running',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        rawItemCount: 0,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      markSucceeded: jest.fn((input) => ({
        id: input.runId,
        jobId: 'job_1',
        pluginId: 'mock',
        capabilityId: 'list-items',
        status: 'succeeded',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        finishedAt: input.finishedAt,
        rawItemCount: input.rawItemCount,
        outputSummary: input.outputSummary,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      markFailed: jest.fn(),
    } as unknown as CollectionRunRepository;
    const rawItemService = {
      create: jest.fn((input) => ({
        id: 'raw_1',
        ...input,
        observedAtBucket: new Date('2026-08-24T10:00:00.000Z'),
        dedupeKey: 'mock:list-items:mock_item_1:2026-08-24T10:00:00.000Z',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
    } as unknown as RawItemService;
    const signalService = {
      createFromRawItem: jest.fn(),
    } as unknown as SignalService;
    const evidenceService = {
      createFromSignal: jest.fn(),
    } as unknown as EvidenceService;

    const service = new CollectionRunnerService(
      registry,
      collectionRunRepository,
      rawItemService,
      signalService,
      evidenceService,
    );

    const result = await service.run({
      id: 'job_1',
      pluginId: 'mock',
      capabilityId: 'list-items',
      params: {
        limit: 1,
      },
      observedAt: new Date('2026-08-24T10:30:00.000Z'),
    });

    expect(rawItemService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'mock',
        sourceType: 'list-items',
        sourceItemId: 'mock_item_1',
      }),
    );
    expect(collectionRunRepository.markSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        rawItemCount: 1,
        outputSummary: expect.objectContaining({
          rawItemCount: 1,
          signalCount: 0,
          evidenceCount: 0,
        }),
      }),
    );
    expect(result.status).toBe('succeeded');
  });

  it('normalizes raw items into signals and evidence when plugin supports it', async () => {
    const registry = new DataSourcePluginRegistry();
    registry.register({
      id: 'normalizing',
      name: 'Normalizing Plugin',
      platform: 'x',
      capabilities: [],
      collect: jest.fn(async (input) => ({
        rawItems: [
          {
            source: 'x',
            sourceType: 'x_trend',
            sourceItemId: 'trend_1',
            observedAt: input.context.observedAt,
            payload: {
              title: 'AI trend',
            },
          },
        ],
        summary: {
          count: 1,
        },
      })),
      normalize: jest.fn(async () => ({
        signal: {
          signalType: 'x_trend',
          title: 'AI trend',
          platform: 'x',
          metrics: {
            rank: 1,
          },
        },
        evidence: [
          {
            claim: 'AI trend appears on X trend list.',
            sourceType: 'x_trend',
            sourceItemId: 'trend_1',
            confidence: 'medium' as const,
          },
        ],
      })),
    });

    const collectionRunRepository = {
      createStarted: jest.fn(() => ({
        id: 'run_3',
        jobId: 'job_3',
        pluginId: 'normalizing',
        capabilityId: 'x.trends.list',
        status: 'running',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        rawItemCount: 0,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      markSucceeded: jest.fn((input) => ({
        id: input.runId,
        jobId: 'job_3',
        pluginId: 'normalizing',
        capabilityId: 'x.trends.list',
        status: 'succeeded',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        finishedAt: input.finishedAt,
        rawItemCount: input.rawItemCount,
        outputSummary: input.outputSummary,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      markFailed: jest.fn(),
    } as unknown as CollectionRunRepository;
    const rawItemService = {
      create: jest.fn((input) => ({
        id: 'raw_3',
        ...input,
        observedAtBucket: new Date('2026-08-24T10:00:00.000Z'),
        dedupeKey: 'x:x_trend:trend_1:2026-08-24T10:00:00.000Z',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
    } as unknown as RawItemService;
    const signalService = {
      createFromRawItem: jest.fn(() => ({
        id: 'signal_1',
        rawItemId: 'raw_3',
        source: 'x',
        platform: 'x',
        signalType: 'x_trend',
        title: 'AI trend',
        observedAt: new Date('2026-08-24T10:30:00.000Z'),
        rawRefs: ['raw_3'],
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
    } as unknown as SignalService;
    const evidenceService = {
      createFromSignal: jest.fn(),
    } as unknown as EvidenceService;
    const opportunityMiningScheduler = {
      runDueMining: jest.fn(() =>
        Promise.resolve({
          selectedCount: 1,
          succeededCount: 1,
        }),
      ),
    } as unknown as OpportunityMiningSchedulerService;

    const service = new CollectionRunnerService(
      registry,
      collectionRunRepository,
      rawItemService,
      signalService,
      evidenceService,
      undefined,
      opportunityMiningScheduler,
    );

    const result = await service.run({
      id: 'job_3',
      pluginId: 'normalizing',
      capabilityId: 'x.trends.list',
      params: {},
      observedAt: new Date('2026-08-24T10:30:00.000Z'),
    });

    expect(signalService.createFromRawItem).toHaveBeenCalledWith(
      expect.objectContaining({
        rawItem: expect.objectContaining({
          id: 'raw_3',
        }),
        signalType: 'x_trend',
        title: 'AI trend',
      }),
    );
    expect(evidenceService.createFromSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceItemId: 'trend_1',
        claim: 'AI trend appears on X trend list.',
      }),
    );
    expect(result.outputSummary).toEqual(
      expect.objectContaining({
        rawItemCount: 1,
        signalCount: 1,
        evidenceCount: 1,
        opportunityMining: {
          selectedCount: 1,
          succeededCount: 1,
        },
      }),
    );
    expect(opportunityMiningScheduler.runDueMining).toHaveBeenCalledWith(
      new Date('2026-08-24T10:30:00.000Z'),
    );
  });

  it('creates x trend snapshots after x trends collection succeeds', async () => {
    const registry = new DataSourcePluginRegistry();
    registry.register({
      id: 'x-trends',
      name: 'X Trends',
      platform: 'x',
      capabilities: [],
      collect: jest.fn(async (input) => ({
        rawItems: [
          {
            source: 'x',
            sourceType: 'x_trend',
            sourceItemId: 'United States:1:OpenAI',
            observedAt: input.context.observedAt,
            payload: {
              name: 'OpenAI',
              query: 'OpenAI',
              region: 'United States',
              rank: 1,
            },
          },
        ],
      })),
    });
    const collectionRunRepository = {
      createStarted: jest.fn(() => ({
        id: 'run_x_trends',
        jobId: 'job_x_trends',
        pluginId: 'x-trends',
        capabilityId: 'x.trends.list',
        status: 'running',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        rawItemCount: 0,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      markSucceeded: jest.fn((input) => ({
        id: input.runId,
        jobId: 'job_x_trends',
        pluginId: 'x-trends',
        capabilityId: 'x.trends.list',
        status: 'succeeded',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        finishedAt: input.finishedAt,
        rawItemCount: input.rawItemCount,
        outputSummary: input.outputSummary,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      markFailed: jest.fn(),
    } as unknown as CollectionRunRepository;
    const rawItemService = {
      create: jest.fn((input) => ({
        id: 'raw_x_trend',
        ...input,
        observedAtBucket: new Date('2026-08-24T10:00:00.000Z'),
        dedupeKey: 'x:x_trend:United States:1:OpenAI:2026-08-24T10:00:00.000Z',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
    } as unknown as RawItemService;
    const snapshotService = {
      createSnapshotsForCollection: jest.fn(),
    } as unknown as XTrendSnapshotService;
    const service = new CollectionRunnerService(
      registry,
      collectionRunRepository,
      rawItemService,
      {} as unknown as SignalService,
      {} as unknown as EvidenceService,
      snapshotService,
    );

    await service.run({
      id: 'job_x_trends',
      pluginId: 'x-trends',
      capabilityId: 'x.trends.list',
      params: {},
      observedAt: new Date('2026-08-24T10:30:00.000Z'),
    });

    expect(snapshotService.createSnapshotsForCollection).toHaveBeenCalledWith({
      collectionRunId: 'run_x_trends',
      observedAt: new Date('2026-08-24T10:30:00.000Z'),
      rawItems: [
        expect.objectContaining({
          sourceItemId: 'United States:1:OpenAI',
        }),
      ],
    });
  });

  it('records plugin failure without throwing', async () => {
    const registry = new DataSourcePluginRegistry();
    registry.register({
      id: 'bad',
      name: 'Bad Plugin',
      platform: 'bad',
      capabilities: [],
      collect: jest.fn(() => {
        throw new Error('plugin failed');
      }),
    });

    const collectionRunRepository = {
      createStarted: jest.fn(() => ({
        id: 'run_2',
        jobId: 'job_2',
        pluginId: 'bad',
        capabilityId: 'explode',
        status: 'running',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        rawItemCount: 0,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      markSucceeded: jest.fn(),
      markFailed: jest.fn((input) => ({
        id: input.runId,
        jobId: 'job_2',
        pluginId: 'bad',
        capabilityId: 'explode',
        status: 'failed',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        finishedAt: input.finishedAt,
        rawItemCount: 0,
        errorMessage: input.errorMessage,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
    } as unknown as CollectionRunRepository;
    const rawItemService = {
      create: jest.fn(),
    } as unknown as RawItemService;
    const signalService = {
      createFromRawItem: jest.fn(),
    } as unknown as SignalService;
    const evidenceService = {
      createFromSignal: jest.fn(),
    } as unknown as EvidenceService;
    const service = new CollectionRunnerService(
      registry,
      collectionRunRepository,
      rawItemService,
      signalService,
      evidenceService,
    );

    const result = await service.run({
      id: 'job_2',
      pluginId: 'bad',
      capabilityId: 'explode',
      params: {},
      observedAt: new Date('2026-08-24T10:30:00.000Z'),
    });

    expect(rawItemService.create).not.toHaveBeenCalled();
    expect(collectionRunRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_2',
        errorMessage: 'plugin failed',
      }),
    );
    expect(result.status).toBe('failed');
  });
});

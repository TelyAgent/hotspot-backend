import { PrismaService } from '../../../src/database/prisma.service';
import { CoreAgentToolsService } from '../../../src/agent/tools/core-agent-tools.service';
import { ToolRegistryService } from '../../../src/agent/tool-registry/tool-registry.service';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';

describe('CoreAgentToolsService', () => {
  it('registers default read tools for agent workflows', () => {
    const registry = new ToolRegistryService();
    const service = createService(registry, {} as unknown as PrismaService);

    service.onModuleInit();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      'projectConfig.getXTrendConfig',
      'signal.search',
      'signal.getRecent',
      'signal.getById',
      'xTrend.getLatestRanking',
      'xTrend.getRecentDiffs',
      'xTrend.getCrossRegionPresence',
      'evidence.search',
      'evidence.getBySignalId',
      'opportunity.findSimilar',
      'opportunity.getById',
      'event.findSimilar',
      'event.getById',
      'topicWatch.list',
      'topicWatch.listActive',
      'topicWatch.get',
      'topicWatch.getCandidates',
      'topicWatch.getAuthorPostPerformance',
      'tasks.findSimilar',
    ]);
  });

  it('executes signal.search against prisma', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'sig_1',
              title: 'OpenAI 新模型发布',
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    const output = await registry.get('signal.search').execute({
      query: 'OpenAI',
      take: 5,
    });

    expect(prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
      }),
    );
    expect(output).toEqual({
      items: [
        {
          id: 'sig_1',
          title: 'OpenAI 新模型发布',
          observedAt: '2026-08-24T10:00:00.000Z',
        },
      ],
    });
  });

  it('executes evidence.getBySignalId against prisma', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      evidenceItem: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'ev_1',
              signalId: 'sig_1',
              claim: 'OpenAI 发布新模型。',
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    const output = await registry.get('evidence.getBySignalId').execute({
      signalId: 'sig_1',
      take: 5,
    });

    expect(prisma.evidenceItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          signalId: 'sig_1',
        },
        take: 5,
      }),
    );
    expect(output).toEqual({
      items: [
        {
          id: 'ev_1',
          signalId: 'sig_1',
          claim: 'OpenAI 发布新模型。',
          observedAt: '2026-08-24T10:00:00.000Z',
        },
      ],
    });
  });

  it('executes xTrend.getLatestRanking from latest snapshot items', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      xTrendSnapshot: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'snapshot_1',
            region: 'global',
            observedAt: new Date('2026-08-26T07:17:17.684Z'),
            items: [
              {
                id: 'item_1',
                name: '#YourtuberQ2',
                query: '#YourtuberQ2',
                rank: 1,
                url: 'https://x.com/search?q=%23YourtuberQ2',
                heat: null,
                category: null,
              },
              {
                id: 'item_2',
                name: 'Happy Onam',
                query: '"Happy Onam"',
                rank: 2,
                url: 'https://x.com/search?q=%22Happy%20Onam%22',
                heat: null,
                category: null,
              },
            ],
          }),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    const output = await registry.get('xTrend.getLatestRanking').execute({
      region: 'global',
      limit: 5,
    });

    expect(prisma.xTrendSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        region: 'global',
      },
      orderBy: {
        observedAt: 'desc',
      },
      include: {
        items: {
          orderBy: {
            rank: 'asc',
          },
          take: 5,
        },
      },
    });
    expect(output).toEqual({
      region: 'global',
      observedAt: '2026-08-26T07:17:17.684Z',
      items: [
        {
          id: 'item_1',
          name: '#YourtuberQ2',
          query: '#YourtuberQ2',
          rank: 1,
          url: 'https://x.com/search?q=%23YourtuberQ2',
          heat: null,
          category: null,
        },
        {
          id: 'item_2',
          name: 'Happy Onam',
          query: '"Happy Onam"',
          rank: 2,
          url: 'https://x.com/search?q=%22Happy%20Onam%22',
          heat: null,
          category: null,
        },
      ],
    });
  });

  it('normalizes worldwide x trend ranking region to global', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      xTrendSnapshot: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'snapshot_1',
            region: 'global',
            observedAt: new Date('2026-08-26T07:17:17.684Z'),
            items: [],
          }),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    await registry.get('xTrend.getLatestRanking').execute({
      region: 'Worldwide',
    });

    expect(prisma.xTrendSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          region: 'global',
        },
      }),
    );
  });

  it('executes xTrend.getRecentDiffs against prisma', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      xTrendSnapshotDiff: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'diff_1',
              query: 'OpenAI',
              region: 'United States',
              previousRank: 15,
              currentRank: 5,
              rankDelta: 10,
              diffType: 'up',
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    const output = await registry.get('xTrend.getRecentDiffs').execute({
      query: 'OpenAI',
      take: 5,
    });

    expect(prisma.xTrendSnapshotDiff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          query: {
            contains: 'OpenAI',
            mode: 'insensitive',
          },
        }),
        take: 5,
      }),
    );
    expect(output).toEqual({
      items: [
        expect.objectContaining({
          id: 'diff_1',
          rankDelta: 10,
          observedAt: '2026-08-24T10:00:00.000Z',
        }),
      ],
    });
  });

  it('executes xTrend.getCrossRegionPresence against prisma', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      xTrendSnapshotItem: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'item_1',
              query: 'OpenAI',
              rank: 2,
              snapshot: {
                region: 'United States',
                observedAt: new Date('2026-08-24T10:00:00.000Z'),
              },
            },
            {
              id: 'item_2',
              query: 'OpenAI',
              rank: 4,
              snapshot: {
                region: 'Japan',
                observedAt: new Date('2026-08-24T10:00:00.000Z'),
              },
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    const output = await registry.get('xTrend.getCrossRegionPresence').execute({
      query: 'OpenAI',
      lookbackHours: 24,
    });

    expect(prisma.xTrendSnapshotItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          query: {
            contains: 'OpenAI',
            mode: 'insensitive',
          },
        }),
      }),
    );
    expect(output).toEqual({
      query: 'OpenAI',
      regionCount: 2,
      regions: ['United States', 'Japan'],
      items: expect.arrayContaining([
        expect.objectContaining({
          region: 'United States',
          rank: 2,
        }),
      ]),
    });
  });

  it('executes topicWatch.listActive against prisma', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      topicWatch: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'topic-ai',
              name: 'AI 与科技',
              description: 'AI 行业重点主题',
              domains: ['ai'],
              watchIntent: '追踪 AI 行业机会',
              triggerPolicy: 'AI 模型、芯片、监管',
              status: 'active',
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    const output = await registry.get('topicWatch.listActive').execute({
      take: 5,
    });

    expect(prisma.topicWatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'active',
        },
        take: 5,
      }),
    );
    expect(output).toEqual({
      items: [
        expect.objectContaining({
          id: 'topic-ai',
          name: 'AI 与科技',
        }),
      ],
    });
  });

  it('executes topicWatch.getAuthorPostPerformance against prisma', async () => {
    const registry = new ToolRegistryService();
    const prisma = {
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'sig_target',
              metadata: {
                postId: 'post_target',
                authorHandle: 'OpenAI',
              },
              metrics: {
                likes: 95,
                reposts: 5,
              },
              observedAt: new Date('2026-08-24T10:00:00.000Z'),
            },
            {
              id: 'sig_other',
              metadata: {
                postId: 'post_other',
                authorHandle: 'OpenAI',
              },
              metrics: {
                likes: 10,
              },
              observedAt: new Date('2026-08-23T10:00:00.000Z'),
            },
          ]),
        ),
      },
    } as unknown as PrismaService;
    const service = createService(registry, prisma);

    service.onModuleInit();
    const output = await registry.get('topicWatch.getAuthorPostPerformance').execute({
      authorHandle: 'OpenAI',
      postId: 'post_target',
      lookbackDays: 30,
    });

    expect(prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platform: 'x',
          signalType: 'x_post',
        }),
      }),
    );
    expect(output).toEqual(
      expect.objectContaining({
        authorHandle: 'OpenAI',
        postId: 'post_target',
        targetScore: 100,
        sampleSize: 2,
        percentile: 100,
        isTop5Percent: true,
      }),
    );
  });
});

function createService(
  registry: ToolRegistryService,
  prisma: PrismaService,
  projectConfigService = {
    getXTrendCollectionConfig: jest.fn(() =>
      Promise.resolve({
        regions: ['global', 'United States'],
        limit: 30,
        collectionIntervalMs: 10800000,
        trendCollectionEnabled: true,
        topicWatchSchedulerEnabled: true,
      }),
    ),
  } as unknown as ProjectConfigService,
) {
  return new CoreAgentToolsService(registry, prisma, projectConfigService);
}

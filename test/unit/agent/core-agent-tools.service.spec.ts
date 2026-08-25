import { PrismaService } from '../../../src/database/prisma.service';
import { CoreAgentToolsService } from '../../../src/agent/tools/core-agent-tools.service';
import { ToolRegistryService } from '../../../src/agent/tool-registry/tool-registry.service';

describe('CoreAgentToolsService', () => {
  it('registers default read tools for agent workflows', () => {
    const registry = new ToolRegistryService();
    const service = new CoreAgentToolsService(
      registry,
      {} as unknown as PrismaService,
    );

    service.onModuleInit();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      'signal.search',
      'signal.getRecent',
      'evidence.search',
      'opportunity.findSimilar',
      'opportunity.getById',
      'event.findSimilar',
      'event.getById',
      'topicWatch.get',
      'topicWatch.getCandidates',
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
    const service = new CoreAgentToolsService(registry, prisma);

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
});

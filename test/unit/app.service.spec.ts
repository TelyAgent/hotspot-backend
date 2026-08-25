import { AppService } from '../../src/app.service';
import { OpenAiModelProvider } from '../../src/agent/model-provider/openai-model-provider';
import { ToolRegistryService } from '../../src/agent/tool-registry/tool-registry.service';
import { PrismaService } from '../../src/database/prisma.service';

describe('AppService', () => {
  it('returns detailed service health', async () => {
    const service = new AppService(
      {
        $queryRaw: jest.fn(() => Promise.resolve([{ ok: 1 }])),
      } as unknown as PrismaService,
      {
        list: jest.fn(() => [
          {
            name: 'signal.search',
          },
        ]),
      } as unknown as ToolRegistryService,
      {
        isConfigured: jest.fn(() => true),
      } as unknown as OpenAiModelProvider,
    );

    await expect(service.health()).resolves.toEqual({
      status: 'ok',
      service: 'hotspot-v2-backend',
      checks: {
        database: {
          status: 'ok',
        },
        tools: {
          status: 'ok',
          count: 1,
          names: ['signal.search'],
        },
        modelProvider: {
          status: 'configured',
          provider: 'openai',
        },
      },
    });
  });
});

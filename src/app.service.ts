import { Injectable } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { OpenAiModelProvider } from './agent/model-provider/openai-model-provider';
import { ToolRegistryService } from './agent/tool-registry/tool-registry.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly openAiModelProvider: OpenAiModelProvider,
  ) {}

  async health() {
    const database = await this.checkDatabase();
    const tools = this.toolRegistry.list();

    return {
      status:
        database.status === 'ok' && tools.length > 0 ? 'ok' : 'degraded',
      service: 'hotspot-v2-backend',
      checks: {
        database,
        tools: {
          status: tools.length > 0 ? 'ok' : 'degraded',
          count: tools.length,
          names: tools.map((tool) => tool.name),
        },
        modelProvider: {
          status: this.openAiModelProvider.isConfigured()
            ? 'configured'
            : 'not_configured',
          provider: 'openai',
        },
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'ok' | 'error';
    errorMessage?: string;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
      };
    } catch (error) {
      return {
        status: 'error',
        errorMessage:
          error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }
}

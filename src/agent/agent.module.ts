import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma.module';
import { AgentController } from './agent.controller';
import { AgentRunRepository } from './run-log/agent-run.repository';
import { AgentRunLogService } from './run-log/agent-run-log.service';
import { CoreAgentToolsService } from './tools/core-agent-tools.service';
import { ToolExecutorService } from './tool-registry/tool-executor.service';
import { ToolRegistryService } from './tool-registry/tool-registry.service';
import { LangGraphAgentWorkflowEngine } from './workflow-engine/langgraph-agent-workflow-engine';
import { OpenAiModelProvider } from './model-provider/openai-model-provider';
import { UnconfiguredModelProvider } from './model-provider/unconfigured-model-provider';
import { AGENT_WORKFLOW_ENGINE, MODEL_PROVIDER } from './agent.tokens';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AgentController],
  providers: [
    ToolRegistryService,
    ToolExecutorService,
    AgentRunRepository,
    AgentRunLogService,
    CoreAgentToolsService,
    UnconfiguredModelProvider,
    OpenAiModelProvider,
    LangGraphAgentWorkflowEngine,
    {
      provide: MODEL_PROVIDER,
      useFactory: (
        openAiModelProvider: OpenAiModelProvider,
        unconfiguredModelProvider: UnconfiguredModelProvider,
      ) =>
        openAiModelProvider.isConfigured()
          ? openAiModelProvider
          : unconfiguredModelProvider,
      inject: [OpenAiModelProvider, UnconfiguredModelProvider],
    },
    {
      provide: AGENT_WORKFLOW_ENGINE,
      useExisting: LangGraphAgentWorkflowEngine,
    },
  ],
  exports: [
    ToolRegistryService,
    ToolExecutorService,
    AgentRunLogService,
    OpenAiModelProvider,
    AGENT_WORKFLOW_ENGINE,
    MODEL_PROVIDER,
  ],
})
export class AgentModule {}

import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { ModelProvider } from '../model-provider/model-provider.interface';
import { AgentRunLogService } from '../run-log/agent-run-log.service';
import { ToolExecutorService } from '../tool-registry/tool-executor.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import {
  AgentRunInput,
  AgentRunResult,
  AgentWorkflowEngine,
} from './agent-workflow-engine.interface';

@Injectable()
export class SimpleAgentWorkflowEngine implements AgentWorkflowEngine {
  constructor(
    private readonly modelProvider: ModelProvider,
    private readonly toolExecutor: ToolExecutorService,
    private readonly agentRunLogService: AgentRunLogService,
    private readonly toolRegistry?: ToolRegistryService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const run = await this.agentRunLogService.startRun({
      agentType: input.agentType,
      goal: input.goal,
    });
    const maxSteps = input.maxSteps ?? 5;
    const toolResults: JsonObject[] = [];

    try {
      for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
        const step = await this.modelProvider.completeStructured({
          agentType: input.agentType,
          goal: input.goal,
          stepIndex,
          evidence: [],
          toolResults,
          availableTools: this.toolRegistry?.list() ?? [],
        });
        await this.agentRunLogService.recordStep({
          runId: run.id,
          stepIndex,
          stepType: step.type,
          input: {
            agentType: input.agentType,
            goal: input.goal,
            toolResults,
          },
          output: step as unknown as JsonObject,
          reason: step.type === 'tool_call' ? step.reason : undefined,
        });

        if (step.type === 'final_decision') {
          await this.agentRunLogService.finishRun({
            runId: run.id,
            status: 'succeeded',
            result: step.decision,
          });

          return {
            runId: run.id,
            status: 'succeeded',
            result: step.decision,
          };
        }

        const toolResult = await this.toolExecutor.execute({
          runId: run.id,
          toolName: step.toolName,
          arguments: step.arguments,
          requestedFields: step.requestedFields,
        });

        toolResults.push({
          toolName: toolResult.toolName,
          output: toolResult.output,
          reason: step.reason,
        });
      }

      throw new DomainError(
        'Agent workflow exhausted its step budget.',
        'AGENT_STEP_BUDGET_EXHAUSTED',
        {
          maxSteps,
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown agent workflow error';

      await this.agentRunLogService.finishRun({
        runId: run.id,
        status: 'failed',
        errorMessage,
      });

      return {
        runId: run.id,
        status: 'failed',
        errorMessage,
      };
    }
  }
}

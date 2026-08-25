import { Inject, Injectable } from '@nestjs/common';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { ModelProvider } from '../model-provider/model-provider.interface';
import { AgentRunLogService } from '../run-log/agent-run-log.service';
import { ToolExecutorService } from '../tool-registry/tool-executor.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import { MODEL_PROVIDER } from '../agent.tokens';
import {
  AgentRunInput,
  AgentRunResult,
  AgentStepOutput,
  AgentWorkflowEngine,
} from './agent-workflow-engine.interface';

interface LangGraphAgentState {
  runId: string;
  agentType: string;
  goal: JsonObject;
  stepIndex: number;
  maxSteps: number;
  evidence: JsonObject[];
  toolResults: JsonObject[];
  nextStep?: AgentStepOutput;
  result?: JsonValue;
}

const AgentStateAnnotation = Annotation.Root({
  state: Annotation<LangGraphAgentState>(),
});

type AgentGraphState = typeof AgentStateAnnotation.State;

@Injectable()
export class LangGraphAgentWorkflowEngine implements AgentWorkflowEngine {
  constructor(
    @Inject(MODEL_PROVIDER)
    private readonly modelProvider: ModelProvider,
    private readonly toolExecutor: ToolExecutorService,
    private readonly agentRunLogService: AgentRunLogService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const run = await this.agentRunLogService.startRun({
      agentType: input.agentType,
      goal: input.goal,
    });
    const graph = this.createGraph();

    try {
      const output = await graph.invoke({
        state: {
          runId: run.id,
          agentType: input.agentType,
          goal: input.goal,
          stepIndex: 0,
          maxSteps: input.maxSteps ?? 5,
          evidence: [],
          toolResults: [],
        },
      });

      if (output.state.result === undefined) {
        throw new DomainError(
          'Agent workflow finished without a final decision.',
          'AGENT_FINAL_DECISION_MISSING',
          {
            maxSteps: output.state.maxSteps,
            stepIndex: output.state.stepIndex,
          },
        );
      }

      await this.agentRunLogService.finishRun({
        runId: run.id,
        status: 'succeeded',
        result: output.state.result,
      });

      return {
        runId: run.id,
        status: 'succeeded',
        result: output.state.result,
      };
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

  private createGraph() {
    return new StateGraph(AgentStateAnnotation)
      .addNode('model_step', (graphState: AgentGraphState) =>
        this.runModelStep(graphState),
      )
      .addNode('tool_step', (graphState: AgentGraphState) =>
        this.runToolStep(graphState),
      )
      .addNode('final_step', (graphState: AgentGraphState) => graphState)
      .addEdge(START, 'model_step')
      .addConditionalEdges(
        'model_step',
        (graphState: AgentGraphState) => this.routeAfterModelStep(graphState),
        {
          tool_step: 'tool_step',
          final_step: 'final_step',
        },
      )
      .addEdge('tool_step', 'model_step')
      .addEdge('final_step', END)
      .compile({
        name: 'hotspot-agent-workflow',
      });
  }

  private async runModelStep(
    graphState: AgentGraphState,
  ): Promise<Partial<AgentGraphState>> {
    const state = graphState.state;

    if (state.stepIndex >= state.maxSteps) {
      throw new DomainError(
        'Agent workflow exhausted its step budget.',
        'AGENT_STEP_BUDGET_EXHAUSTED',
        {
          maxSteps: state.maxSteps,
        },
      );
    }

    const step = await this.modelProvider.completeStructured({
      agentType: state.agentType,
      goal: state.goal,
      stepIndex: state.stepIndex,
      evidence: state.evidence,
      toolResults: state.toolResults,
      availableTools: this.toolRegistry.list(),
    });
    await this.agentRunLogService.recordStep({
      runId: state.runId,
      stepIndex: state.stepIndex,
      stepType: step.type,
      input: {
        agentType: state.agentType,
        goal: state.goal,
        toolResults: state.toolResults,
      },
      output: step as unknown as JsonObject,
      reason: step.type === 'tool_call' ? step.reason : undefined,
    });

    return {
      state: {
        ...state,
        stepIndex: state.stepIndex + 1,
        nextStep: step,
        result: step.type === 'final_decision' ? step.decision : undefined,
      },
    };
  }

  private async runToolStep(
    graphState: AgentGraphState,
  ): Promise<Partial<AgentGraphState>> {
    const state = graphState.state;

    if (state.nextStep?.type !== 'tool_call') {
      return graphState;
    }

    const toolResult = await this.toolExecutor.execute({
      runId: state.runId,
      toolName: state.nextStep.toolName,
      arguments: state.nextStep.arguments,
      requestedFields: state.nextStep.requestedFields,
    });

    return {
      state: {
        ...state,
        nextStep: undefined,
        toolResults: [
          ...state.toolResults,
          {
            toolName: toolResult.toolName,
            output: toolResult.output,
            reason: state.nextStep.reason,
          },
        ],
      },
    };
  }

  private routeAfterModelStep(
    graphState: AgentGraphState,
  ): 'tool_step' | 'final_step' {
    return graphState.state.nextStep?.type === 'tool_call'
      ? 'tool_step'
      : 'final_step';
  }
}

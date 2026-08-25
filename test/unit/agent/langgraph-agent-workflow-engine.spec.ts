import { AgentRunLogService } from '../../../src/agent/run-log/agent-run-log.service';
import { MockModelProvider } from '../../../src/agent/model-provider/mock-model-provider';
import { LangGraphAgentWorkflowEngine } from '../../../src/agent/workflow-engine/langgraph-agent-workflow-engine';
import { ToolExecutorService } from '../../../src/agent/tool-registry/tool-executor.service';
import { ToolRegistryService } from '../../../src/agent/tool-registry/tool-registry.service';

describe('LangGraphAgentWorkflowEngine', () => {
  it('finishes successfully when the model returns a final decision', async () => {
    const model = new MockModelProvider([
      {
        type: 'final_decision',
        decision: {
          decision: 'create_opportunity',
        },
      },
    ]);
    const toolExecutor = {
      execute: jest.fn(),
    } as unknown as ToolExecutorService;
    const runLog = createRunLog();
    const engine = new LangGraphAgentWorkflowEngine(
      model,
      toolExecutor,
      runLog,
      createToolRegistry(),
    );

    const result = await engine.run({
      agentType: 'opportunity',
      goal: {
        instruction: 'Find opportunities.',
      },
    });

    expect(result).toEqual({
      runId: 'run_1',
      status: 'succeeded',
      result: {
        decision: 'create_opportunity',
      },
    });
    expect(toolExecutor.execute).not.toHaveBeenCalled();
    expect(runLog.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepIndex: 0,
        stepType: 'final_decision',
      }),
    );
    expect(runLog.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        status: 'succeeded',
      }),
    );
  });

  it('uses a LangGraph loop to execute tools before returning a final decision', async () => {
    const model = new MockModelProvider([
      {
        type: 'tool_call',
        toolName: 'signal.search',
        reason: 'Need related signals.',
        arguments: {
          query: 'AI',
        },
        requestedFields: ['id', 'title'],
      },
      {
        type: 'final_decision',
        decision: {
          decision: 'create_opportunity',
        },
      },
    ]);
    const toolExecutor = {
      execute: jest.fn(() =>
        Promise.resolve({
          toolName: 'signal.search',
          output: {
            items: [{ id: 'sig_1', title: 'AI release' }],
          },
        }),
      ),
    } as unknown as ToolExecutorService;
    const runLog = createRunLog();
    const engine = new LangGraphAgentWorkflowEngine(
      model,
      toolExecutor,
      runLog,
      createToolRegistry(),
    );

    const result = await engine.run({
      agentType: 'opportunity',
      goal: {
        instruction: 'Find opportunities.',
      },
      maxSteps: 3,
    });

    expect(toolExecutor.execute).toHaveBeenCalledWith({
      runId: 'run_1',
      toolName: 'signal.search',
      arguments: {
        query: 'AI',
      },
      requestedFields: ['id', 'title'],
    });
    expect(model.inputs[0].availableTools).toEqual([
      expect.objectContaining({
        name: 'signal.search',
      }),
    ]);
    expect(runLog.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepIndex: 0,
        stepType: 'tool_call',
        reason: 'Need related signals.',
      }),
    );
    expect(result.status).toBe('succeeded');
  });

  it('finishes as failed when the step budget is exhausted', async () => {
    const model = new MockModelProvider([
      {
        type: 'tool_call',
        toolName: 'signal.search',
        reason: 'Need related signals.',
        arguments: {
          query: 'AI',
        },
      },
    ]);
    const toolExecutor = {
      execute: jest.fn(() =>
        Promise.resolve({
          toolName: 'signal.search',
          output: {
            items: [],
          },
        }),
      ),
    } as unknown as ToolExecutorService;
    const runLog = createRunLog();
    const engine = new LangGraphAgentWorkflowEngine(
      model,
      toolExecutor,
      runLog,
      createToolRegistry(),
    );

    const result = await engine.run({
      agentType: 'opportunity',
      goal: {
        instruction: 'Find opportunities.',
      },
      maxSteps: 1,
    });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe(
      'Agent workflow exhausted its step budget.',
    );
    expect(runLog.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        status: 'failed',
      }),
    );
  });
});

function createRunLog(): AgentRunLogService {
  return {
    startRun: jest.fn(() =>
      Promise.resolve({
        id: 'run_1',
        agentType: 'opportunity',
        status: 'running',
        goal: {},
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      }),
    ),
    recordToolCall: jest.fn(() => Promise.resolve()),
    recordStep: jest.fn(() => Promise.resolve()),
    finishRun: jest.fn((input) =>
      Promise.resolve({
        id: input.runId,
        agentType: 'opportunity',
        status: input.status,
        goal: {},
        result: input.result,
        errorMessage: input.errorMessage,
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        finishedAt: input.finishedAt,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      }),
    ),
  } as unknown as AgentRunLogService;
}

function createToolRegistry(): ToolRegistryService {
  const registry = new ToolRegistryService();
  registry.register({
    name: 'signal.search',
    description: 'Search normalized signals.',
    permission: 'read',
    fieldSelection: {
      supported: true,
      allowedFields: ['id', 'title'],
      defaultFields: ['id', 'title'],
    },
    execute: jest.fn(),
  });

  return registry;
}

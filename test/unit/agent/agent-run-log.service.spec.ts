import { AgentRunRepository } from '../../../src/agent/run-log/agent-run.repository';
import { AgentRunLogService } from '../../../src/agent/run-log/agent-run-log.service';

describe('AgentRunLogService', () => {
  it('reads agent runs and related traces through the repository', async () => {
    const repository = {
      createRun: jest.fn(),
      finishRun: jest.fn(),
      recordToolCall: jest.fn(),
      recordStep: jest.fn(),
      listRuns: jest.fn(() => Promise.resolve([])),
      findRunById: jest.fn(() => Promise.resolve(null)),
      listSteps: jest.fn(() => Promise.resolve([])),
      listToolCalls: jest.fn(() => Promise.resolve([])),
    } as unknown as AgentRunRepository;
    const service = new AgentRunLogService(repository);

    await service.listRuns({ agentType: 'opportunity', take: 10 });
    await service.findRunById('run_1');
    await service.listSteps('run_1');
    await service.listToolCalls('run_1');

    expect(repository.listRuns).toHaveBeenCalledWith({
      agentType: 'opportunity',
      take: 10,
    });
    expect(repository.findRunById).toHaveBeenCalledWith('run_1');
    expect(repository.listSteps).toHaveBeenCalledWith('run_1');
    expect(repository.listToolCalls).toHaveBeenCalledWith('run_1');
  });

  it('starts and finishes an agent run through the repository', async () => {
    const repository = {
      createRun: jest.fn((input) => ({
        id: 'run_1',
        agentType: input.agentType,
        status: 'running',
        goal: input.goal,
        startedAt: input.startedAt,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      finishRun: jest.fn((input) => ({
        id: input.runId,
        agentType: 'opportunity',
        status: input.status,
        goal: {},
        result: input.result,
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        finishedAt: input.finishedAt,
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
        updatedAt: new Date('2026-08-24T10:00:00.000Z'),
      })),
      recordToolCall: jest.fn(() => Promise.resolve()),
      recordStep: jest.fn(),
    } as unknown as AgentRunRepository;
    const service = new AgentRunLogService(repository);

    const run = await service.startRun({
      agentType: 'opportunity',
      goal: {
        instruction: 'Find opportunities.',
      },
      startedAt: new Date('2026-08-24T10:00:00.000Z'),
    });
    const finished = await service.finishRun({
      runId: run.id,
      status: 'succeeded',
      result: {
        decision: 'create_opportunity',
      },
      finishedAt: new Date('2026-08-24T10:01:00.000Z'),
    });

    expect(repository.createRun).toHaveBeenCalledTimes(1);
    expect(repository.finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        status: 'succeeded',
      }),
    );
    expect(finished.result).toEqual({
      decision: 'create_opportunity',
    });
  });

  it('records tool calls through the repository', async () => {
    const repository = {
      createRun: jest.fn(),
      finishRun: jest.fn(),
      recordToolCall: jest.fn(() => Promise.resolve()),
      recordStep: jest.fn(),
    } as unknown as AgentRunRepository;
    const service = new AgentRunLogService(repository);

    await service.recordToolCall({
      runId: 'run_1',
      toolName: 'signal.search',
      status: 'succeeded',
      input: {
        arguments: {
          query: 'AI',
        },
      },
      output: {
        items: [],
      },
      startedAt: new Date('2026-08-24T10:00:00.000Z'),
      finishedAt: new Date('2026-08-24T10:00:01.000Z'),
    });

    expect(repository.recordToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        toolName: 'signal.search',
        status: 'succeeded',
      }),
    );
  });

  it('records model steps through the repository', async () => {
    const repository = {
      createRun: jest.fn(),
      finishRun: jest.fn(),
      recordToolCall: jest.fn(),
      recordStep: jest.fn((input) =>
        Promise.resolve({
          id: 'step_1',
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          ...input,
        }),
      ),
    } as unknown as AgentRunRepository;
    const service = new AgentRunLogService(repository);

    const step = await service.recordStep({
      runId: 'run_1',
      stepIndex: 0,
      stepType: 'tool_call',
      input: {
        goal: {
          instruction: 'Find opportunities.',
        },
      },
      output: {
        type: 'tool_call',
        toolName: 'signal.search',
      },
      reason: 'Need more signals.',
    });

    expect(repository.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepIndex: 0,
        stepType: 'tool_call',
      }),
    );
    expect(step.id).toBe('step_1');
  });
});

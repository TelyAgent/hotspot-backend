import { DomainError } from '../../../src/common/errors/domain-error';
import { AgentRunLogService } from '../../../src/agent/run-log/agent-run-log.service';
import { ToolExecutorService } from '../../../src/agent/tool-registry/tool-executor.service';
import { ToolRegistryService } from '../../../src/agent/tool-registry/tool-registry.service';

describe('ToolExecutorService', () => {
  it('executes a registered tool and records the call', async () => {
    const registry = new ToolRegistryService();
    registry.register({
      name: 'signal.search',
      description: 'Search signals.',
      permission: 'read',
      fieldSelection: {
        supported: true,
        allowedFields: ['id', 'title'],
        defaultFields: ['id'],
      },
      execute: jest.fn(() =>
        Promise.resolve({
          items: [{ id: 'sig_1', title: 'AI release' }],
        }),
      ),
    });
    const runLog = {
      recordToolCall: jest.fn(() => Promise.resolve()),
    } as unknown as AgentRunLogService;
    const executor = new ToolExecutorService(registry, runLog);

    const result = await executor.execute({
      runId: 'run_1',
      toolName: 'signal.search',
      arguments: {
        query: 'AI',
      },
      requestedFields: ['id', 'title'],
    });

    expect(result.output).toEqual({
      items: [{ id: 'sig_1', title: 'AI release' }],
    });
    expect(runLog.recordToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        toolName: 'signal.search',
        status: 'succeeded',
      }),
    );
  });

  it('applies default field selection when requested fields are omitted', async () => {
    const registry = new ToolRegistryService();
    registry.register({
      name: 'signal.search',
      description: 'Search signals.',
      permission: 'read',
      fieldSelection: {
        supported: true,
        allowedFields: ['id', 'title'],
        defaultFields: ['id'],
      },
      execute: jest.fn(() =>
        Promise.resolve({
          items: [{ id: 'sig_1', title: 'AI release' }],
        }),
      ),
    });
    const runLog = {
      recordToolCall: jest.fn(() => Promise.resolve()),
    } as unknown as AgentRunLogService;
    const executor = new ToolExecutorService(registry, runLog);

    const result = await executor.execute({
      toolName: 'signal.search',
      arguments: {
        query: 'AI',
      },
    });

    expect(result.output).toEqual({
      items: [{ id: 'sig_1' }],
    });
  });

  it('keeps nested items intact when top-level items field is requested', async () => {
    const registry = new ToolRegistryService();
    registry.register({
      name: 'xTrend.getLatestRanking',
      description: 'Get latest x trend ranking.',
      permission: 'read',
      fieldSelection: {
        supported: true,
        allowedFields: ['region', 'observedAt', 'items'],
        defaultFields: ['region', 'observedAt', 'items'],
      },
      execute: jest.fn(() =>
        Promise.resolve({
          region: 'global',
          observedAt: '2026-08-26T07:17:17.684Z',
          items: [
            {
              rank: 1,
              name: '#YourtuberQ2',
              query: '#YourtuberQ2',
            },
          ],
        }),
      ),
    });
    const runLog = {
      recordToolCall: jest.fn(() => Promise.resolve()),
    } as unknown as AgentRunLogService;
    const executor = new ToolExecutorService(registry, runLog);

    const result = await executor.execute({
      runId: 'run_1',
      toolName: 'xTrend.getLatestRanking',
      arguments: {
        region: 'global',
      },
      requestedFields: ['region', 'observedAt', 'items'],
    });

    expect(result.output).toEqual({
      region: 'global',
      observedAt: '2026-08-26T07:17:17.684Z',
      items: [
        {
          rank: 1,
          name: '#YourtuberQ2',
          query: '#YourtuberQ2',
        },
      ],
    });
  });

  it('rejects requested fields outside the tool allowlist', async () => {
    const registry = new ToolRegistryService();
    registry.register({
      name: 'signal.search',
      description: 'Search signals.',
      permission: 'read',
      fieldSelection: {
        supported: true,
        allowedFields: ['id'],
        defaultFields: ['id'],
      },
      execute: jest.fn(),
    });
    const runLog = {
      recordToolCall: jest.fn(() => Promise.resolve()),
    } as unknown as AgentRunLogService;
    const executor = new ToolExecutorService(registry, runLog);

    await expect(
      executor.execute({
        toolName: 'signal.search',
        arguments: {
          query: 'AI',
        },
        requestedFields: ['title'],
      }),
    ).rejects.toThrow(DomainError);
    expect(runLog.recordToolCall).not.toHaveBeenCalled();
  });

  it('records failed tool calls and rethrows the error', async () => {
    const registry = new ToolRegistryService();
    registry.register({
      name: 'signal.search',
      description: 'Search signals.',
      permission: 'read',
      execute: jest.fn(() => {
        throw new Error('tool failed');
      }),
    });
    const runLog = {
      recordToolCall: jest.fn(() => Promise.resolve()),
    } as unknown as AgentRunLogService;
    const executor = new ToolExecutorService(registry, runLog);

    await expect(
      executor.execute({
        runId: 'run_1',
        toolName: 'signal.search',
        arguments: {
          query: 'AI',
        },
      }),
    ).rejects.toThrow('tool failed');

    expect(runLog.recordToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        toolName: 'signal.search',
        status: 'failed',
        errorMessage: 'tool failed',
      }),
    );
  });
});

import { CopilotService } from '../../../src/copilot/copilot.service';
import { AssistantService } from '../../../src/assistant/assistant.service';
import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { PrismaService } from '../../../src/database/prisma.service';

describe('CopilotService', () => {
  it('persists agent proposed actions as pending actions', async () => {
    const prisma = createPrismaMock();
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'agent_run_1',
          status: 'succeeded',
          result: {
            message: '准备更新热榜配置，请确认。',
            proposedActions: [
              {
                tool: 'update_twitter_config',
                summary: '将 X 热榜条数调整为 20',
                arguments: {
                  limit: 20,
                },
                requiresConfirmation: true,
              },
            ],
            usedTools: ['projectConfig.getXTrendConfig'],
            missingData: [],
            suggestedNextSteps: [],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = new CopilotService(
      prisma,
      workflowEngine,
      {
        tryAnswerDeterministic: jest.fn(() => Promise.resolve(null)),
      } as unknown as AssistantService,
    );

    const response = await service.chat({
      tenantId: 'tenant_1',
      userId: 'user_1',
      client: 'hotspot-master',
      message: '预测市场行业添加监控账号 @Jason',
      context: {
        page: 'settings',
      },
    });

    expect(prisma.copilotProposedAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 'session_1',
        agentRunId: 'agent_run_1',
        tool: 'update_twitter_config',
        summary: '将 X 热榜条数调整为 20',
        status: 'pending',
      }),
    });
    expect(response.proposedActions).toEqual([
      expect.objectContaining({
        id: 'action_1',
        tool: 'update_twitter_config',
        status: 'pending',
      }),
    ]);
  });

  it('confirms pending action through assistant controlled tool execution', async () => {
    const prisma = createPrismaMock();
    const assistantService = {
      executeTool: jest.fn(() =>
        Promise.resolve({
          message: '已更新 X/Twitter 热榜配置。',
          result: { limit: 20 },
        }),
      ),
    } as unknown as AssistantService;
    const service = new CopilotService(
      prisma,
      {} as AgentWorkflowEngine,
      assistantService,
    );

    const response = await service.confirmAction('action_1', {
      confirmedBy: 'user_1',
    });

    expect(assistantService.executeTool).toHaveBeenCalledWith({
      tool: 'update_twitter_config',
      arguments: {
        limit: 20,
      },
    });
    expect(prisma.copilotAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        userId: 'user_1',
        actionId: 'action_1',
        tool: 'update_twitter_config',
        operation: 'confirm_action',
      }),
    });
    expect(response.message).toBe('已更新 X/Twitter 热榜配置。');
  });
});

function createPrismaMock(): PrismaService {
  return {
    copilotSession: {
      create: jest.fn(() =>
        Promise.resolve({
          id: 'session_1',
          tenantId: 'tenant_1',
          userId: 'user_1',
          client: 'hotspot-master',
        }),
      ),
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    copilotMessage: {
      create: jest.fn(() => Promise.resolve({ id: 'message_1' })),
    },
    copilotProposedAction: {
      create: jest.fn(() =>
        Promise.resolve({
          id: 'action_1',
          agentRunId: 'agent_run_1',
          sessionId: 'session_1',
          tenantId: 'tenant_1',
          userId: 'user_1',
          tool: 'update_twitter_config',
          summary: '将 X 热榜条数调整为 20',
          arguments: {
            limit: 20,
          },
          status: 'pending',
          requiresConfirmation: true,
        }),
      ),
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'action_1',
          agentRunId: 'agent_run_1',
          sessionId: 'session_1',
          tenantId: 'tenant_1',
          userId: 'user_1',
          tool: 'update_twitter_config',
          summary: '将 X 热榜条数调整为 20',
          arguments: {
            limit: 20,
          },
          status: 'pending',
          requiresConfirmation: true,
        }),
      ),
      update: jest.fn(() =>
        Promise.resolve({
          id: 'action_1',
          status: 'succeeded',
        }),
      ),
    },
    copilotAuditLog: {
      create: jest.fn(() => Promise.resolve({ id: 'audit_1' })),
    },
  } as unknown as PrismaService;
}

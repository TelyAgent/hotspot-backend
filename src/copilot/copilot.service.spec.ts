import { CopilotService } from './copilot.service';

describe('CopilotService', () => {
  it('answers X trend config questions through deterministic config read before model workflow', async () => {
    const prisma = {
      copilotSession: {
        create: jest.fn().mockResolvedValue({
          id: 'session_1',
        }),
      },
      copilotMessage: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const workflowEngine = {
      run: jest.fn(),
    };
    const assistantService = {
      tryAnswerDeterministic: jest.fn().mockResolvedValue({
        message:
          '当前 X 热榜采集地区共 5 个：global、United States、United Kingdom、Japan、Korea。',
      }),
    };
    const service = new CopilotService(
      prisma as never,
      workflowEngine as never,
      assistantService as never,
    );

    const response = await service.chat({
      tenantId: 'default',
      userId: 'tester',
      client: 'web',
      message: '当前X热榜采集的地区有哪些？',
      context: { page: 'settings' },
    });

    expect(response.message).toContain('United States');
    expect(response.message).toContain('Korea');
    expect(response.usedTools).toEqual(['projectConfig.getXTrendConfig']);
    expect(workflowEngine.run).not.toHaveBeenCalled();
  });
});

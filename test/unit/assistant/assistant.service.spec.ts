import { AssistantService } from '../../../src/assistant/assistant.service';
import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';

describe('AssistantService', () => {
  it('executes twitter config tools through project config service', async () => {
    const projectConfigService = {
      getXTrendCollectionConfig: jest.fn(() =>
        Promise.resolve({
          regions: ['global'],
          limit: 30,
          collectionIntervalMs: 7200000,
          trendCollectionEnabled: true,
        }),
      ),
      updateXTrendCollectionConfig: jest.fn(() =>
        Promise.resolve({
          regions: ['global', 'United States'],
          limit: 20,
          collectionIntervalMs: 3600000,
          trendCollectionEnabled: true,
        }),
      ),
    } as unknown as ProjectConfigService;
    const service = new AssistantService(projectConfigService);

    const current = await service.executeTool({
      tool: 'get_twitter_config',
      arguments: {},
    });
    const updated = await service.executeTool({
      tool: 'update_twitter_config',
      arguments: {
        regions: ['global', 'United States'],
        limit: 20,
        collectionIntervalMs: 3600000,
      },
    });

    expect(current.result).toEqual(expect.objectContaining({ limit: 30 }));
    expect(projectConfigService.updateXTrendCollectionConfig).toHaveBeenCalledWith(
      {
        regions: ['global', 'United States'],
        limit: 20,
        collectionIntervalMs: 3600000,
      },
      'assistant',
    );
    expect(updated.message).toBe('已更新 X/Twitter 热榜配置。');
  });

  it('proposes a confirmed action before changing twitter limit', async () => {
    const service = new AssistantService({} as ProjectConfigService);

    const response = await service.chat({
      message: '把热搜榜条数改成 10',
      context: {
        page: 'settings',
        setting: 'twitter',
      },
    });

    expect(response.proposedActions).toEqual([
      expect.objectContaining({
        tool: 'update_twitter_config',
        arguments: {
          limit: 10,
        },
        requiresConfirmation: true,
      }),
    ]);
  });

  it('uses assistant agent for open-ended read questions', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'agent_run_1',
          status: 'succeeded',
          result: {
            message: '我查了 X 热榜配置，当前没有异常。',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = new AssistantService({} as ProjectConfigService, workflowEngine);

    const response = await service.chat({
      message: '为什么 X 热榜一直没有更新？',
      context: {
        page: 'monitor',
      },
    });

    expect(workflowEngine.run).toHaveBeenCalledWith({
      agentType: 'assistant',
      goal: {
        message: '为什么 X 热榜一直没有更新？',
        context: {
          page: 'monitor',
        },
        intentHint: expect.objectContaining({
          type: 'diagnosis',
        }),
        responseLanguage: 'zh-CN',
      },
      maxSteps: 4,
    });
    expect(response.message).toContain('我查了 X 热榜配置');
  });
});

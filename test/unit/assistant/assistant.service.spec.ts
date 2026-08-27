import { AssistantService } from '../../../src/assistant/assistant.service';
import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';

describe('AssistantService', () => {
  it('executes twitter config tools through project config service', async () => {
    const projectConfigService = {
      getXTrendCollectionConfig: jest.fn(() =>
        Promise.resolve({
          regions: ['global'],
          limit: 30,
          collectionIntervalMs: 7200000,
        }),
      ),
      updateXTrendCollectionConfig: jest.fn(() =>
        Promise.resolve({
          regions: ['global', 'United States'],
          limit: 20,
          collectionIntervalMs: 3600000,
        }),
      ),
    } as unknown as ProjectConfigService;
    const topicWatchRepository = {
      listTopicWatches: jest.fn(),
    } as unknown as TopicWatchRepository;
    const service = new AssistantService(
      projectConfigService,
      topicWatchRepository,
    );

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

    expect(current.result).toEqual(
      expect.objectContaining({
        limit: 30,
      }),
    );
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
    const service = new AssistantService(
      {} as ProjectConfigService,
      {} as TopicWatchRepository,
    );

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

  it('answers configured topic watches when user asks what topic circles are configured', async () => {
    const topicWatchRepository = {
      listTopicWatches: jest.fn(() =>
        Promise.resolve([
          {
            id: 'topic-ai-tech',
            name: 'AI 与科技',
            description: 'AI 产品、模型、芯片与监管事件',
            domains: ['AI', '科技'],
            watchIntent: '关注 AI 行业重要变化',
            collectionPolicy: '',
            triggerPolicy: '',
            evidencePolicy: '',
            status: 'active',
            accounts: [
              {
                id: 'account-openai',
                topicWatchId: 'topic-ai-tech',
                handle: 'OpenAI',
                primaryRole: '第一方权威账号',
                singleTriggerPolicy: 'S1',
                authorityScope: 'OpenAI 官方动态',
                status: 'active',
                sortOrder: 1,
                createdAt: new Date('2026-08-27T00:00:00.000Z'),
                updatedAt: new Date('2026-08-27T00:00:00.000Z'),
              },
            ],
            createdAt: new Date('2026-08-27T00:00:00.000Z'),
            updatedAt: new Date('2026-08-27T00:00:00.000Z'),
          },
          {
            id: 'topic-crypto',
            name: 'Crypto 与 Web3',
            description: 'Crypto、Web3 与链上应用',
            domains: ['Crypto', 'Web3'],
            watchIntent: '关注行业热点',
            collectionPolicy: '',
            triggerPolicy: '',
            evidencePolicy: '',
            status: 'paused',
            accounts: [],
            createdAt: new Date('2026-08-27T00:00:00.000Z'),
            updatedAt: new Date('2026-08-27T00:00:00.000Z'),
          },
        ]),
      ),
    } as unknown as TopicWatchRepository;
    const service = new AssistantService(
      {} as ProjectConfigService,
      topicWatchRepository,
    );

    const response = await service.chat({
      message: '我现在主题圈配置了哪些主题？',
      context: {
        page: 'settings',
        setting: 'twitter',
      },
    });

    expect(topicWatchRepository.listTopicWatches).toHaveBeenCalled();
    expect(response.message).toContain('当前已配置 2 个主题圈');
    expect(response.message).toContain('AI 与科技');
    expect(response.message).toContain('1 个监控账号');
    expect(response.message).toContain('@OpenAI');
    expect(response.message).toContain('Crypto 与 Web3');
    expect(response.proposedActions).toBeUndefined();
  });

  it('uses assistant agent for open-ended read questions', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'agent_run_1',
          status: 'succeeded',
          result: {
            message:
              '我查了主题圈配置、候选话题和最近采集记录，当前没有形成事件是因为候选话题未命中触发规则。',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = new AssistantService(
      {} as ProjectConfigService,
      {} as TopicWatchRepository,
      workflowEngine,
    );

    const response = await service.chat({
      message: '为什么主题追踪一直没有形成事件？',
      context: {
        page: 'monitor',
        setting: 'topic-watch',
      },
    });

    expect(workflowEngine.run).toHaveBeenCalledWith({
      agentType: 'assistant',
      goal: {
        message: '为什么主题追踪一直没有形成事件？',
        context: {
          page: 'monitor',
          setting: 'topic-watch',
        },
        intentHint: expect.objectContaining({
          type: 'diagnosis',
        }),
        responseLanguage: 'zh-CN',
      },
      maxSteps: 4,
    });
    expect(response.message).toContain('我查了主题圈配置');
  });

  it('returns agent proposed actions for configuration edits', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'agent_run_1',
          status: 'succeeded',
          result: {
            message:
              '我找到了“预测市场行业”主题，准备把 @Jason 添加为监控账号。请确认后执行。',
            proposedActions: [
              {
                id: 'agent_action_1',
                tool: 'add_twitter_topic_account',
                summary: '给“预测市场行业”添加监控账号 @Jason',
                arguments: {
                  topicWatchId: 'topic-prediction-market',
                  handle: 'Jason',
                  primaryRole: '待补全：请根据该账号公开身份确认来源角色',
                  singleTriggerPolicy: 'C',
                  authorityScope: '待补全：请根据该账号公开身份确认单点权限',
                },
                requiresConfirmation: true,
              },
            ],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = new AssistantService(
      {} as ProjectConfigService,
      {} as TopicWatchRepository,
      workflowEngine,
    );

    const response = await service.chat({
      message: '预测市场行业添加监控账号 @Jason',
      context: {
        page: 'settings',
        setting: 'twitter',
      },
    });

    expect(response.message).toContain('预测市场行业');
    expect(response.proposedActions).toEqual([
      expect.objectContaining({
        tool: 'add_twitter_topic_account',
        arguments: expect.objectContaining({
          topicWatchId: 'topic-prediction-market',
          handle: 'Jason',
        }),
        requiresConfirmation: true,
      }),
    ]);
    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: expect.objectContaining({
          intentHint: expect.objectContaining({
            type: 'config_edit',
            preferredTools: expect.arrayContaining(['topicWatch.list']),
          }),
        }),
      }),
    );
  });

  it('enriches incomplete topic account actions from the original message', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'agent_run_1',
          status: 'succeeded',
          result: {
            message: '准备添加 @Jason，请确认。',
            proposedActions: [
              {
                id: 'agent_action_1',
                tool: 'add_twitter_topic_account',
                summary: '添加监控账号 @Jason',
                arguments: {
                  handle: 'Jason',
                },
                requiresConfirmation: true,
              },
            ],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const service = new AssistantService(
      {} as ProjectConfigService,
      {} as TopicWatchRepository,
      workflowEngine,
    );

    const response = await service.chat({
      message: '预测市场行业添加监控账号 @Jason',
      context: {
        page: 'settings',
        setting: 'twitter',
      },
    });

    expect(response.proposedActions).toEqual([
      expect.objectContaining({
        arguments: expect.objectContaining({
          topicName: '预测市场行业',
          handle: 'Jason',
        }),
      }),
    ]);
  });

  it('resolves topic name from action summary when executing an incomplete action', async () => {
    const topicWatchRepository = {
      listTopicWatches: jest.fn(() =>
        Promise.resolve([
          {
            id: 'topic-prediction-market',
            name: '预测市场行业',
            description: '',
            domains: ['prediction market'],
            watchIntent: '',
            collectionPolicy: '',
            triggerPolicy: '',
            evidencePolicy: '',
            status: 'active',
            accounts: [],
            createdAt: new Date('2026-08-27T00:00:00.000Z'),
            updatedAt: new Date('2026-08-27T00:00:00.000Z'),
          },
        ]),
      ),
      findTopicWatchById: jest.fn(() =>
        Promise.resolve({
          id: 'topic-prediction-market',
          name: '预测市场行业',
          description: '',
          domains: ['prediction market'],
          watchIntent: '',
          collectionPolicy: '',
          triggerPolicy: '',
          evidencePolicy: '',
          status: 'active',
          accounts: [],
          createdAt: new Date('2026-08-27T00:00:00.000Z'),
          updatedAt: new Date('2026-08-27T00:00:00.000Z'),
        }),
      ),
      updateTopicWatchAccounts: jest.fn(() => Promise.resolve([])),
    } as unknown as TopicWatchRepository;
    const service = new AssistantService(
      {} as ProjectConfigService,
      topicWatchRepository,
    );

    await service.executeTool({
      tool: 'add_twitter_topic_account',
      arguments: {
        handle: 'Jason',
        actionSummary: '给“预测市场行业”添加监控账号 @Jason',
      },
    });

    expect(topicWatchRepository.updateTopicWatchAccounts).toHaveBeenCalledWith(
      'topic-prediction-market',
      [
        expect.objectContaining({
          handle: 'Jason',
        }),
      ],
    );
  });

  it('resolves topic name before adding a monitoring account', async () => {
    const topicWatchRepository = {
      listTopicWatches: jest.fn(() =>
        Promise.resolve([
          {
            id: 'topic-prediction-market',
            name: '预测市场行业',
            description: '',
            domains: ['prediction market'],
            watchIntent: '',
            collectionPolicy: '',
            triggerPolicy: '',
            evidencePolicy: '',
            status: 'active',
            accounts: [],
            createdAt: new Date('2026-08-27T00:00:00.000Z'),
            updatedAt: new Date('2026-08-27T00:00:00.000Z'),
          },
        ]),
      ),
      findTopicWatchById: jest.fn(() =>
        Promise.resolve({
          id: 'topic-prediction-market',
          name: '预测市场行业',
          description: '',
          domains: ['prediction market'],
          watchIntent: '',
          collectionPolicy: '',
          triggerPolicy: '',
          evidencePolicy: '',
          status: 'active',
          accounts: [],
          createdAt: new Date('2026-08-27T00:00:00.000Z'),
          updatedAt: new Date('2026-08-27T00:00:00.000Z'),
        }),
      ),
      updateTopicWatchAccounts: jest.fn(() => Promise.resolve([])),
    } as unknown as TopicWatchRepository;
    const service = new AssistantService(
      {} as ProjectConfigService,
      topicWatchRepository,
    );

    const response = await service.executeTool({
      tool: 'add_twitter_topic_account',
      arguments: {
        topicName: '预测市场行业',
        handle: '@Jason',
        primaryRole: '待确认：预测市场行业相关账号',
        singleTriggerPolicy: 'C',
        authorityScope: '待确认：该账号在预测市场行业的单点权限',
      },
    });

    expect(topicWatchRepository.findTopicWatchById).toHaveBeenCalledWith(
      'topic-prediction-market',
    );
    expect(topicWatchRepository.updateTopicWatchAccounts).toHaveBeenCalledWith(
      'topic-prediction-market',
      [
        expect.objectContaining({
          handle: '@Jason',
          primaryRole: '待确认：预测市场行业相关账号',
          singleTriggerPolicy: 'C',
        }),
      ],
    );
    expect(response.message).toBe('已添加重点主题监控账号。');
  });
});

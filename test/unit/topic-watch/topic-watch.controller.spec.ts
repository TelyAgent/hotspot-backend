import { TopicCandidateDetailService } from '../../../src/topic-watch/candidate-detail/topic-candidate-detail.service';
import { TopicWatchCollectionService } from '../../../src/topic-watch/collection/topic-watch-collection.service';
import { TopicWatchAgentService } from '../../../src/topic-watch/decision/topic-watch-agent.service';
import { TopicWatchPipelineStatusService } from '../../../src/topic-watch/status/topic-watch-pipeline-status.service';
import { TopicWatchController } from '../../../src/topic-watch/topic-watch.controller';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';

describe('TopicWatchController', () => {
  it('updates topic watch base config', async () => {
    const repository = {
      updateTopicWatch: jest.fn((id, input) =>
        Promise.resolve({
          id,
          ...input,
        }),
      ),
    } as unknown as TopicWatchRepository;
    const controller = createTopicWatchController({ repository });

    await controller.update('topic_ai', {
      name: 'AI 与科技',
      description: 'AI 模型和科技平台',
      status: 'paused',
      watchIntent: '追踪 AI 热点',
      collectionPolicy: '采集 X 账号帖子',
      triggerPolicy: '多账号集中讨论时触发',
      evidencePolicy: '保留帖子链接',
      exclusionPolicy: '排除教程帖',
    });

    expect(repository.updateTopicWatch).toHaveBeenCalledWith(
      'topic_ai',
      expect.objectContaining({
        name: 'AI 与科技',
        description: 'AI 模型和科技平台',
        status: 'paused',
        watchIntent: '追踪 AI 热点',
      }),
    );
  });

  it('updates active monitoring plan config', async () => {
    const repository = {
      updateActiveMonitoringPlan: jest.fn((topicWatchId, input) =>
        Promise.resolve({
          id: 'plan_1',
          topicWatchId,
          ...input,
        }),
      ),
    } as unknown as TopicWatchRepository;
    const controller = createTopicWatchController({ repository });

    await controller.updateActiveMonitoringPlan('topic_ai', {
      sources: [{ platform: 'x', sourceType: 'account', handle: 'OpenAI' }],
      refreshPolicy: { intervalMinutes: 180, lookbackMinutes: 180 },
      triggerRules: [{ ruleId: 'agent', description: 'Agent 判断' }],
      evidenceRequirements: [{ sourceType: 'x_account_post', requiredFields: ['url'] }],
    });

    expect(repository.updateActiveMonitoringPlan).toHaveBeenCalledWith(
      'topic_ai',
      expect.objectContaining({
        sources: [{ platform: 'x', sourceType: 'account', handle: 'OpenAI' }],
        refreshPolicy: { intervalMinutes: 180, lookbackMinutes: 180 },
      }),
    );
  });

  it('lists monitoring plans', async () => {
    const repository = {
      listMonitoringPlans: jest.fn((topicWatchId) =>
        Promise.resolve([
          {
            id: 'plan_1',
            topicWatchId,
            version: 1,
            status: 'active',
          },
        ]),
      ),
    } as unknown as TopicWatchRepository;
    const controller = createTopicWatchController({ repository });

    const result = await controller.listMonitoringPlans('topic_ai');

    expect(repository.listMonitoringPlans).toHaveBeenCalledWith('topic_ai');
    expect(result).toHaveLength(1);
  });

  it('generates monitoring plan through agent', async () => {
    const repository = {
      findTopicWatchById: jest.fn(() =>
        Promise.resolve({
          id: 'topic_ai',
          name: 'AI 与科技',
          status: 'active',
        }),
      ),
    } as unknown as TopicWatchRepository;
    const agentService = {
      generateMonitoringPlan: jest.fn((input) =>
        Promise.resolve({
          id: 'plan_1',
          topicWatchId: input.topicWatch.id,
          status: input.activate ? 'active' : 'draft',
        }),
      ),
    } as unknown as TopicWatchAgentService;
    const controller = createTopicWatchController({ repository, agentService });

    const result = await controller.generateMonitoringPlan('topic_ai', {
      activate: true,
    });

    expect(agentService.generateMonitoringPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatch: expect.objectContaining({ id: 'topic_ai' }),
        activate: true,
      }),
    );
    expect(result?.status).toBe('active');
  });

  it('activates monitoring plan', async () => {
    const repository = {
      activateMonitoringPlan: jest.fn((topicWatchId, planId) =>
        Promise.resolve({
          id: planId,
          topicWatchId,
          status: 'active',
        }),
      ),
    } as unknown as TopicWatchRepository;
    const controller = createTopicWatchController({ repository });

    await controller.activateMonitoringPlan('topic_ai', 'plan_1');

    expect(repository.activateMonitoringPlan).toHaveBeenCalledWith(
      'topic_ai',
      'plan_1',
    );
  });

  it('starts collection for all active topic watches', async () => {
    const collectionService = {
      collect: jest.fn(() =>
        Promise.resolve({
          topicWatchCount: 1,
          sourceCount: 1,
          rawItemCount: 3,
          signalCount: 3,
          evidenceCount: 3,
          runs: [],
        }),
      ),
    } as unknown as TopicWatchCollectionService;
    const controller = createTopicWatchController({ collectionService });

    const result = await controller.collect();

    expect(collectionService.collect).toHaveBeenCalledWith({});
    expect(result.rawItemCount).toBe(3);
  });

  it('returns topic watch pipeline status', async () => {
    const statusService = {
      getStatus: jest.fn(() =>
        Promise.resolve({
          latestFetchRun: {
            id: 'run_1',
            status: 'succeeded',
            itemCount: 3,
          },
        }),
      ),
    } as unknown as TopicWatchPipelineStatusService;
    const controller = createTopicWatchController({ statusService });

    const result = await controller.status();

    expect(statusService.getStatus).toHaveBeenCalled();
    expect(result.latestFetchRun?.id).toBe('run_1');
  });

  it('starts collection for one topic watch', async () => {
    const collectionService = {
      collect: jest.fn(() =>
        Promise.resolve({
          topicWatchCount: 1,
          sourceCount: 1,
          rawItemCount: 2,
          signalCount: 2,
          evidenceCount: 2,
          runs: [],
        }),
      ),
    } as unknown as TopicWatchCollectionService;
    const controller = createTopicWatchController({ collectionService });

    await controller.collectOne('topic_ai');

    expect(collectionService.collect).toHaveBeenCalledWith({
      topicWatchId: 'topic_ai',
    });
  });
});

function createTopicWatchController(input: {
  repository?: TopicWatchRepository;
  agentService?: TopicWatchAgentService;
  collectionService?: TopicWatchCollectionService;
  detailService?: TopicCandidateDetailService;
  statusService?: TopicWatchPipelineStatusService;
}) {
  return new TopicWatchController(
    input.repository ?? ({} as TopicWatchRepository),
    input.agentService ?? ({} as TopicWatchAgentService),
    input.collectionService ?? ({} as TopicWatchCollectionService),
    input.detailService ?? ({} as TopicCandidateDetailService),
    input.statusService ?? ({} as TopicWatchPipelineStatusService),
  );
}

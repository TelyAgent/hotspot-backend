import { TopicWatchCollectionService } from '../../../src/topic-watch/collection/topic-watch-collection.service';
import { TopicWatchAgentService } from '../../../src/topic-watch/decision/topic-watch-agent.service';
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
    const controller = new TopicWatchController(
      repository,
      {} as TopicWatchAgentService,
      {} as TopicWatchCollectionService,
    );

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
    const controller = new TopicWatchController(
      repository,
      {} as TopicWatchAgentService,
      {} as TopicWatchCollectionService,
    );

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
    const controller = new TopicWatchController(
      {} as TopicWatchRepository,
      {} as TopicWatchAgentService,
      collectionService,
    );

    const result = await controller.collect();

    expect(collectionService.collect).toHaveBeenCalledWith({});
    expect(result.rawItemCount).toBe(3);
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
    const controller = new TopicWatchController(
      {} as TopicWatchRepository,
      {} as TopicWatchAgentService,
      collectionService,
    );

    await controller.collectOne('topic_ai');

    expect(collectionService.collect).toHaveBeenCalledWith({
      topicWatchId: 'topic_ai',
    });
  });
});

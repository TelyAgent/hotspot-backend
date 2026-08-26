import { AssistantService } from '../../../src/assistant/assistant.service';
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
});

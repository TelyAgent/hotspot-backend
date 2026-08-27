import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DomainError } from '../../src/common/errors/domain-error';
import { AssistantController } from '../../src/assistant/assistant.controller';
import { AssistantService } from '../../src/assistant/assistant.service';

describe('Assistant API', () => {
  let app: INestApplication;
  let assistantService: jest.Mocked<Partial<AssistantService>>;

  beforeEach(async () => {
    assistantService = {
      chat: jest.fn(() =>
        Promise.resolve({
          message: '我可以帮你查看和调整当前页面相关配置。',
          proposedActions: [
            {
              id: 'action_1',
              tool: 'update_twitter_config',
              summary: '将 X 热榜条数调整为 30',
              arguments: { limit: 30 },
              requiresConfirmation: true,
            },
          ],
        }),
      ),
      executeTool: jest.fn(() =>
        Promise.resolve({
          message: '已读取 X/Twitter 配置。',
          result: {
            regions: ['global'],
            limit: 30,
            collectionIntervalMs: 7200000,
          },
        }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [
        {
          provide: AssistantService,
          useValue: assistantService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns assistant chat response with proposed actions', async () => {
    const response = await request(app.getHttpServer())
      .post('/assistant/chat')
      .send({
        message: '把热搜榜条数改成 30',
        context: {
          page: 'settings',
          setting: 'twitter',
        },
      })
      .expect(201);

    expect(assistantService.chat).toHaveBeenCalledWith({
      message: '把热搜榜条数改成 30',
      context: {
        page: 'settings',
        setting: 'twitter',
      },
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        message: expect.any(String),
        proposedActions: [
          expect.objectContaining({
            tool: 'update_twitter_config',
            requiresConfirmation: true,
          }),
        ],
      }),
    );
  });

  it('executes assistant tools', async () => {
    const response = await request(app.getHttpServer())
      .post('/assistant/tool-executions')
      .send({
        tool: 'get_twitter_config',
        arguments: {},
      })
      .expect(201);

    expect(assistantService.executeTool).toHaveBeenCalledWith({
      tool: 'get_twitter_config',
      arguments: {},
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        message: '已读取 X/Twitter 配置。',
        result: expect.objectContaining({
          limit: 30,
        }),
      }),
    );
  });

  it('returns bad request for assistant domain errors', async () => {
    assistantService.executeTool = jest.fn(() => {
      throw new DomainError(
        'Topic watch not found.',
        'TOPIC_WATCH_NOT_FOUND',
        {
          topicName: '不存在的主题',
        },
      );
    });

    const response = await request(app.getHttpServer())
      .post('/assistant/tool-executions')
      .send({
        tool: 'add_twitter_topic_account',
        arguments: {
          topicName: '不存在的主题',
          handle: '@Jason',
        },
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        message: 'Topic watch not found.',
        code: 'TOPIC_WATCH_NOT_FOUND',
      }),
    );
  });
});

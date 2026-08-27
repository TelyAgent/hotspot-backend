import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ToolRegistryService } from '../../src/agent/tool-registry/tool-registry.service';
import { CopilotController } from '../../src/copilot/copilot.controller';
import { CopilotService } from '../../src/copilot/copilot.service';

describe('Copilot API', () => {
  let app: INestApplication;
  const copilotService = {
    chat: jest.fn(() =>
      Promise.resolve({
        sessionId: 'session_1',
        runId: 'run_1',
        message: '我已读取配置。',
        proposedActions: [],
        usedTools: ['topicWatch.list'],
        missingData: [],
        suggestedNextSteps: [],
      }),
    ),
    confirmAction: jest.fn(() =>
      Promise.resolve({
        status: 'succeeded',
        message: '已添加重点主题监控账号。',
        result: [{ handle: 'jason' }],
      }),
    ),
    rejectAction: jest.fn(() =>
      Promise.resolve({
        status: 'rejected',
        message: '已拒绝：添加账号',
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CopilotController],
      providers: [
        {
          provide: CopilotService,
          useValue: copilotService,
        },
        {
          provide: ToolRegistryService,
          useValue: {
            list: jest.fn(() => [
              {
                name: 'topicWatch.list',
                description: '读取主题圈配置。',
                permission: 'read',
              },
            ]),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts chat requests from external clients', async () => {
    const response = await request(app.getHttpServer())
      .post('/copilot/chat')
      .send({
        tenantId: 'tenant_1',
        userId: 'user_1',
        client: 'external-system',
        message: '查看主题圈配置',
        context: {
          source: 'api',
        },
      })
      .expect(201);

    expect(copilotService.chat).toHaveBeenCalledWith({
      sessionId: undefined,
      tenantId: 'tenant_1',
      userId: 'user_1',
      client: 'external-system',
      message: '查看主题圈配置',
      context: {
        source: 'api',
      },
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        sessionId: 'session_1',
        message: '我已读取配置。',
      }),
    );
  });

  it('confirms proposed actions', async () => {
    const response = await request(app.getHttpServer())
      .post('/copilot/actions/action_1/confirm')
      .send({
        confirmedBy: 'user_1',
      })
      .expect(201);

    expect(copilotService.confirmAction).toHaveBeenCalledWith('action_1', {
      confirmedBy: 'user_1',
    });
    expect(response.body.message).toBe('已添加重点主题监控账号。');
  });

  it('lists available tools', async () => {
    const response = await request(app.getHttpServer())
      .get('/copilot/tools')
      .expect(200);

    expect(response.body.items).toEqual([
      expect.objectContaining({
        name: 'topicWatch.list',
        permission: 'read',
      }),
    ]);
  });
});

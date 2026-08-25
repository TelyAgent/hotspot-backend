import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AgentController } from '../../src/agent/agent.controller';
import { AGENT_WORKFLOW_ENGINE } from '../../src/agent/agent.tokens';
import { AgentRunLogService } from '../../src/agent/run-log/agent-run-log.service';
import { ToolRegistryService } from '../../src/agent/tool-registry/tool-registry.service';

describe('Agent Debug API', () => {
  let app: INestApplication;
  let runLog: jest.Mocked<Partial<AgentRunLogService>>;
  let workflowEngine: { run: jest.Mock };

  beforeEach(async () => {
    runLog = {
      listRuns: jest.fn(() =>
        Promise.resolve([
          {
            id: 'run_1',
            agentType: 'opportunity',
            status: 'succeeded',
          },
        ] as never),
      ),
      findRunById: jest.fn(() =>
        Promise.resolve({
          id: 'run_1',
          agentType: 'opportunity',
        } as never),
      ),
      listSteps: jest.fn(() =>
        Promise.resolve([
          {
            id: 'step_1',
            runId: 'run_1',
            stepIndex: 0,
            stepType: 'tool_call',
          },
        ] as never),
      ),
      listToolCalls: jest.fn(() =>
        Promise.resolve([
          {
            id: 'call_1',
            runId: 'run_1',
            toolName: 'signal.search',
            status: 'succeeded',
          },
        ] as never),
      ),
    };
    workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_2',
          status: 'succeeded',
          result: {
            decision: 'ok',
          },
        }),
      ),
    };
    const toolRegistry = new ToolRegistryService();
    toolRegistry.register({
      name: 'signal.search',
      description: 'Search signals.',
      permission: 'read',
      execute: jest.fn(),
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentRunLogService,
          useValue: runLog,
        },
        {
          provide: ToolRegistryService,
          useValue: toolRegistry,
        },
        {
          provide: AGENT_WORKFLOW_ENGINE,
          useValue: workflowEngine,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists agent runs', async () => {
    const response = await request(app.getHttpServer())
      .get('/agent/runs?agentType=opportunity&take=10')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'run_1',
        agentType: 'opportunity',
      }),
    ]);
    expect(runLog.listRuns).toHaveBeenCalledWith({
      agentType: 'opportunity',
      status: undefined,
      take: 10,
    });
  });

  it('lists steps and tool calls for a run', async () => {
    await request(app.getHttpServer())
      .get('/agent/runs/run_1/steps')
      .expect(200);
    await request(app.getHttpServer())
      .get('/agent/runs/run_1/tool-calls')
      .expect(200);

    expect(runLog.listSteps).toHaveBeenCalledWith('run_1');
    expect(runLog.listToolCalls).toHaveBeenCalledWith('run_1');
  });

  it('lists available tools without execute handlers', async () => {
    const response = await request(app.getHttpServer())
      .get('/agent/tools')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        name: 'signal.search',
        permission: 'read',
      }),
    ]);
    expect(response.body[0].execute).toBeUndefined();
  });

  it('runs the playground workflow', async () => {
    await request(app.getHttpServer())
      .post('/agent/playground/run')
      .send({
        agentType: 'opportunity_mining',
        goal: {
          instruction: '测试机会挖掘',
        },
        maxSteps: 2,
      })
      .expect(201);

    expect(workflowEngine.run).toHaveBeenCalledWith({
      agentType: 'opportunity_mining',
      goal: {
        instruction: '测试机会挖掘',
      },
      maxSteps: 2,
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { OpportunityMiningOrchestratorService } from '../../src/opportunity/mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningSchedulerService } from '../../src/opportunity/mining/opportunity-mining-scheduler.service';
import { OpportunityController } from '../../src/opportunity/opportunity.controller';
import { OpportunityRepository } from '../../src/opportunity/opportunity.repository';
import { OpportunityRulePackGovernanceService } from '../../src/opportunity/rule-pack/opportunity-rule-pack-governance.service';

describe('Opportunity API', () => {
  let app: INestApplication;
  let repository: jest.Mocked<Partial<OpportunityRepository>>;
  let orchestrator: jest.Mocked<Partial<OpportunityMiningOrchestratorService>>;
  let scheduler: jest.Mocked<Partial<OpportunityMiningSchedulerService>>;
  let rulePackGovernance: jest.Mocked<Partial<OpportunityRulePackGovernanceService>>;

  beforeEach(async () => {
    repository = {
      listOpportunities: jest.fn(() =>
        Promise.resolve([
          {
            id: 'opp_1',
            title: 'AI 产品机会',
            status: 'suggested',
          },
        ] as never),
      ),
      listEvents: jest.fn(() =>
        Promise.resolve({
          items: [
            {
              id: 'event_1',
              title: 'Top 5 事件',
              labels: [
                {
                  code: 'x_trend_top_5',
                  name: 'Top 5',
                  category: 'trigger',
                },
              ],
            },
          ],
          total: 1,
          page: 2,
          pageSize: 10,
        } as never),
      ),
      listMiningSignalRuns: jest.fn(() =>
        Promise.resolve([
          {
            id: 'run_1',
            signalId: 'sig_1',
            status: 'succeeded',
            decision: 'create_insight',
            signal: {
              id: 'sig_1',
              title: 'OpenAI',
              signalType: 'x_trend',
            },
          },
        ] as never),
      ),
      findOpportunityById: jest.fn(() =>
        Promise.resolve({
          id: 'opp_1',
          title: 'AI 产品机会',
        } as never),
      ),
      updateOpportunityStatus: jest.fn((input) =>
        Promise.resolve({
          id: input.id,
          status: input.status,
        } as never),
      ),
      createOpportunity: jest.fn((input) =>
        Promise.resolve({
          id: 'opp_created',
          ...input,
        } as never),
      ),
    };
    orchestrator = {
      createGoal: jest.fn((input) => ({
        id: 'goal_1',
        type: 'detect_opportunity',
        instruction: input.instruction,
        seedSignalIds: input.seedSignalIds ?? [],
        seedEvidenceIds: input.seedEvidenceIds,
        sourceContext: input.sourceContext,
        constraints: {
          maxToolCalls: 6,
          maxRunMs: 60000,
          allowedToolCategories: ['read'],
          writeMode: input.writeMode ?? 'suggest_only',
        },
      })),
      run: jest.fn(() =>
        Promise.resolve({
          decision: {
            decision: 'create_opportunity',
            title: 'AI 产品机会',
            opportunityType: 'industry_topic',
            summary: 'AI 话题正在升温。',
            whyNow: '近期讨论密集。',
            whyItMatters: '适合产品承接。',
            productAngles: ['产品效率'],
            contentWindow: '24h',
            confidence: 'medium',
            evidenceRefs: ['ev_1'],
            missingData: [],
            riskNotes: [],
          },
        } as never),
      ),
    };
    scheduler = {
      runDueMining: jest.fn(() =>
        Promise.resolve({
          selectedCount: 2,
          succeededCount: 1,
        }),
      ),
    };
    rulePackGovernance = {
      getActiveRulePack: jest.fn(() =>
        Promise.resolve({
          id: 'rule_pack_1',
          version: 1,
          status: 'active',
          basePath: '/rules',
          documents: [
            {
              id: 'x-trend-rules',
              title: 'X 热搜挖掘规则',
              path: '/rules/x-trend-rules.md',
              markdown: '# X 热搜挖掘规则',
            },
          ],
          routes: [],
        } as never),
      ),
      createDraft: jest.fn(() =>
        Promise.resolve({
          id: 'rule_pack_draft',
          version: 2,
          status: 'draft',
        } as never),
      ),
      activate: jest.fn((id) =>
        Promise.resolve({
          id,
          status: 'active',
        } as never),
      ),
      reset: jest.fn(() =>
        Promise.resolve({
          id: 'rule_pack_reset',
          status: 'active',
        } as never),
      ),
      testRun: jest.fn(() =>
        Promise.resolve({
          decision: {
            decision: 'ignore',
          },
        } as never),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [OpportunityController],
      providers: [
        {
          provide: OpportunityRepository,
          useValue: repository,
        },
        {
          provide: OpportunityMiningOrchestratorService,
          useValue: orchestrator,
        },
        {
          provide: OpportunityMiningSchedulerService,
          useValue: scheduler,
        },
        {
          provide: OpportunityRulePackGovernanceService,
          useValue: rulePackGovernance,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists opportunities', async () => {
    const response = await request(app.getHttpServer())
      .get('/opportunities')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'opp_1',
        title: 'AI 产品机会',
      }),
    ]);
  });

  it('lists events with pagination and label filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/opportunities/events?page=2&pageSize=10&label=Top%205')
      .expect(200);

    expect(repository.listEvents).toHaveBeenCalledWith({
      status: undefined,
      label: 'Top 5',
      page: 2,
      pageSize: 10,
    });
    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          id: 'event_1',
          title: 'Top 5 事件',
        }),
      ],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('mines an opportunity decision through the orchestrator', async () => {
    await request(app.getHttpServer())
      .post('/opportunities/mine')
      .send({
        instruction: '从证据里挖掘机会',
      })
      .expect(201);

    expect(orchestrator.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: '从证据里挖掘机会',
        writeMode: 'suggest_only',
      }),
    );
    expect(orchestrator.run).toHaveBeenCalled();
  });

  it('lists opportunity mining runs', async () => {
    const response = await request(app.getHttpServer())
      .get('/opportunities/mining-runs?status=succeeded&take=10')
      .expect(200);

    expect(repository.listMiningSignalRuns).toHaveBeenCalledWith({
      status: 'succeeded',
      take: 10,
    });
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'run_1',
        signalId: 'sig_1',
        decision: 'create_insight',
      }),
    ]);
  });

  it('runs due opportunity mining once', async () => {
    const response = await request(app.getHttpServer())
      .post('/opportunities/mine-due')
      .send({
        now: '2026-08-25T08:00:00.000Z',
      })
      .expect(201);

    expect(scheduler.runDueMining).toHaveBeenCalledWith(
      new Date('2026-08-25T08:00:00.000Z'),
    );
    expect(response.body).toEqual({
      selectedCount: 2,
      succeededCount: 1,
    });
  });

  it('returns the active opportunity rule pack', async () => {
    const response = await request(app.getHttpServer())
      .get('/opportunities/rule-pack')
      .expect(200);

    expect(rulePackGovernance.getActiveRulePack).toHaveBeenCalled();
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'rule_pack_1',
        documents: [
          expect.objectContaining({
            id: 'x-trend-rules',
          }),
        ],
      }),
    );
  });

  it('creates an opportunity rule pack draft', async () => {
    const response = await request(app.getHttpServer())
      .post('/opportunities/rule-pack/draft')
      .send({
        description: '调整热搜规则',
        documents: [
          {
            id: 'x-trend-rules',
            markdown: '# 新规则',
          },
        ],
      })
      .expect(201);

    expect(rulePackGovernance.createDraft).toHaveBeenCalledWith({
      description: '调整热搜规则',
      documents: [
        {
          id: 'x-trend-rules',
          markdown: '# 新规则',
          title: undefined,
        },
      ],
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 'rule_pack_draft',
        status: 'draft',
      }),
    );
  });

  it('confirms an opportunity', async () => {
    await request(app.getHttpServer())
      .post('/opportunities/opp_1/confirm')
      .expect(201);

    expect(repository.updateOpportunityStatus).toHaveBeenCalledWith({
      id: 'opp_1',
      status: 'confirmed',
    });
  });
});

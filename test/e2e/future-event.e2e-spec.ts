import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { FutureEventCandidateService } from '../../src/future-event/candidate/future-event-candidate.service';
import { FutureEventController } from '../../src/future-event/future-event.controller';
import { FutureEventRepository } from '../../src/future-event/future-event.repository';
import { FutureEventMonitoringAgentService } from '../../src/future-event/monitoring/future-event-monitoring-agent.service';
import { FutureEventMonitoringExecutionService } from '../../src/future-event/monitoring/future-event-monitoring-execution.service';
import { FutureEventActionScoreService } from '../../src/future-event/score/future-event-action-score.service';
import { FutureEventSourceDiscoveryAgentService } from '../../src/future-event/source/future-event-source-discovery-agent.service';
import { FutureEventSourceService } from '../../src/future-event/source/future-event-source.service';
import { FutureEventSourceStrategyService } from '../../src/future-event/source/future-event-source-strategy.service';

describe('FutureEvent API', () => {
  let app: INestApplication;
  let candidateService: jest.Mocked<Partial<FutureEventCandidateService>>;
  let monitoringExecutionService: jest.Mocked<Partial<FutureEventMonitoringExecutionService>>;

  beforeEach(async () => {
    candidateService = {
      listCandidates: jest.fn(() =>
        Promise.resolve([
          {
            id: 'candidate_1',
            title: 'CPI 发布',
            eventType: 'economic_data',
            scheduledAt: new Date('2026-08-26T12:30:00.000Z'),
            domains: ['macro', 'finance'],
            summary: 'CPI 数据发布。',
            whyItMatters: '通胀数据会影响市场预期。',
            suggestedKeywords: ['CPI'],
            suggestedAccounts: ['BLS_gov'],
            suggestedPlatforms: ['x'],
            evidenceRefs: ['signal_1'],
            confidence: 'high',
            status: 'new',
            missingData: [],
            riskNotes: [],
            createdAt: new Date('2026-08-25T00:00:00.000Z'),
            updatedAt: new Date('2026-08-25T00:00:00.000Z'),
          },
        ] as never),
      ),
      confirmCandidate: jest.fn(() =>
        Promise.resolve({
          event: {
            id: 'future_1',
            title: 'CPI 发布',
          },
          monitoringPlan: {
            id: 'plan_1',
          },
        } as never),
      ),
    };
    monitoringExecutionService = {
      runDuePlans: jest.fn(() =>
        Promise.resolve({
          planCount: 1,
          collectionRunCount: 1,
        } as never),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FutureEventController],
      providers: [
        {
          provide: FutureEventRepository,
          useValue: {
            listEvents: jest.fn(() => Promise.resolve([])),
            updateCandidateStatus: jest.fn((input) =>
              Promise.resolve({
                id: input.id,
                status: input.status,
              }),
            ),
          },
        },
        {
          provide: FutureEventMonitoringAgentService,
          useValue: {},
        },
        {
          provide: FutureEventSourceService,
          useValue: {
            sourceStatus: jest.fn(() => Promise.resolve([])),
          },
        },
        {
          provide: FutureEventSourceStrategyService,
          useValue: {
            readStrategy: jest.fn(() =>
              Promise.resolve({
                path: '/tmp/future-event-source-strategy.md',
                markdown: '# 策略',
              }),
            ),
            writeStrategy: jest.fn((markdown) =>
              Promise.resolve({
                path: '/tmp/future-event-source-strategy.md',
                markdown,
              }),
            ),
          },
        },
        {
          provide: FutureEventSourceDiscoveryAgentService,
          useValue: {
            generatePlanFromStrategy: jest.fn(() =>
              Promise.resolve({
                id: 'source_plan_1',
              }),
            ),
          },
        },
        {
          provide: FutureEventCandidateService,
          useValue: candidateService,
        },
        {
          provide: FutureEventMonitoringExecutionService,
          useValue: monitoringExecutionService,
        },
        FutureEventActionScoreService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists future event candidates', async () => {
    const response = await request(app.getHttpServer())
      .get('/future-events/candidates?status=new')
      .expect(200);

    expect(candidateService.listCandidates).toHaveBeenCalledWith({
      status: 'new',
      take: 50,
    });
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'candidate_1',
      }),
    ]);
  });

  it('lists new candidates as unassigned future events for the schedule page', async () => {
    const response = await request(app.getHttpServer())
      .get('/future-events?unassigned=true')
      .expect(200);

    expect(candidateService.listCandidates).toHaveBeenCalledWith({
      status: 'new',
      take: 50,
    });
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'candidate_1',
        title: 'CPI 发布',
        confirmationLevel: 'candidate',
        actionScore: expect.objectContaining({
          total: expect.any(Number),
          version: 'future-event-action-score@v1',
        }),
      }),
    ]);
  });

  it('lists scheduled candidates in the monthly calendar view', async () => {
    const response = await request(app.getHttpServer())
      .get('/future-events?month=2026-08')
      .expect(200);

    expect(candidateService.listCandidates).toHaveBeenCalledWith({
      status: 'new',
      take: 50,
    });
    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'candidate_1',
        title: 'CPI 发布',
        factTime: '2026-08-26T12:30:00.000Z',
        confirmationLevel: 'candidate',
      }),
    ]);
  });

  it('confirms a candidate through the candidate route', async () => {
    const response = await request(app.getHttpServer())
      .post('/future-events/candidates/candidate_1/confirm')
      .expect(201);

    expect(candidateService.confirmCandidate).toHaveBeenCalledWith('candidate_1');
    expect(response.body).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({
          id: 'future_1',
        }),
        monitoringPlan: expect.objectContaining({
          id: 'plan_1',
        }),
      }),
    );
  });

  it('runs due monitoring plans through the static route', async () => {
    const response = await request(app.getHttpServer())
      .post('/future-events/monitoring-plans/run-due')
      .send({
        observedAt: '2026-09-09T12:00:00.000Z',
      })
      .expect(201);

    expect(monitoringExecutionService.runDuePlans).toHaveBeenCalledWith({
      observedAt: new Date('2026-09-09T12:00:00.000Z'),
    });
    expect(response.body).toEqual(
      expect.objectContaining({
        planCount: 1,
        collectionRunCount: 1,
      }),
    );
  });
});

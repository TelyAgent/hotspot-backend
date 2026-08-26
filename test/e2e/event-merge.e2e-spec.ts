import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { EventMergeController } from '../../src/event-merge/event-merge.controller';
import { EventMergeRepository } from '../../src/event-merge/event-merge.repository';

describe('EventMerge API', () => {
  let app: INestApplication;
  let repository: jest.Mocked<Partial<EventMergeRepository>>;

  beforeEach(async () => {
    repository = {
      listSourceContexts: jest.fn(() =>
        Promise.resolve([
          {
            id: 'ctx_1',
            mainEventId: 'event_1',
            sourceType: 'x_trend',
            triggerType: 'top_5',
            contextVersion: 1,
            title: 'OpenAI 发布 API',
            summary: 'OpenAI 登上热搜。',
            identity: {
              subject: 'OpenAI',
              action: '正式发布',
              object: 'API',
              time: {},
              state: 'confirmed',
              coreFact: 'OpenAI 正式发布 API。',
            },
            evidenceRefs: ['ev_1'],
            signalRefs: ['sig_1'],
            payload: {},
            triggeredAt: new Date('2026-08-26T00:00:00.000Z'),
            createdAt: new Date('2026-08-26T00:00:00.000Z'),
            updatedAt: new Date('2026-08-26T00:00:00.000Z'),
          },
        ] as never),
      ),
      getLatestMergeDecision: jest.fn(() =>
        Promise.resolve({
          id: 'decision_1',
          incomingContextId: 'ctx_1',
          candidateMainEventId: 'event_1',
          decision: 'auto_merge',
          mergeConfidence: 0.97,
          hardConflict: false,
          dimensionResults: [
            {
              dimension: 'subject',
              label: '主体',
              score: 1,
              result: 'compatible',
              comparison: '同一公司或机构',
              evidenceRefs: ['ev_1'],
            },
          ],
          conflictPoints: [],
          evidenceRefs: ['ev_1'],
          impact: {
            responseAction: 'route_once',
            reason: '自动合并后由主 Event 路由一次。',
          },
          decidedBy: 'agent',
          decidedAt: new Date('2026-08-26T00:01:00.000Z'),
          createdAt: new Date('2026-08-26T00:01:00.000Z'),
        } as never),
      ),
      listRelations: jest.fn(() => Promise.resolve([])),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EventMergeController],
      providers: [
        {
          provide: EventMergeRepository,
          useValue: repository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns merge detail for an event', async () => {
    const response = await request(app.getHttpServer())
      .get('/events/event_1/merge-detail')
      .expect(200);

    expect(repository.listSourceContexts).toHaveBeenCalledWith('event_1');
    expect(repository.getLatestMergeDecision).toHaveBeenCalledWith('event_1');
    expect(response.body).toEqual(
      expect.objectContaining({
        eventId: 'event_1',
        contextVersion: 1,
        sourceContexts: [
          expect.objectContaining({
            id: 'ctx_1',
            sourceType: 'x_trend',
          }),
        ],
        latestIdentityDecision: expect.objectContaining({
          mergeConfidence: 0.97,
          decision: 'auto_merge',
          systemAction: '自动合并',
          reason: '自动合并后由主 Event 路由一次。',
        }),
        relations: [],
      }),
    );
  });
});

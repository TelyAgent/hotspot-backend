import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { TopicWatchCollectionService } from '../../src/topic-watch/collection/topic-watch-collection.service';
import { TopicWatchAgentService } from '../../src/topic-watch/decision/topic-watch-agent.service';
import { TopicWatchController } from '../../src/topic-watch/topic-watch.controller';
import { TopicWatchRepository } from '../../src/topic-watch/topic-watch.repository';

describe('TopicWatch API', () => {
  let app: INestApplication;
  let repository: jest.Mocked<Partial<TopicWatchRepository>>;
  let collectionService: jest.Mocked<Partial<TopicWatchCollectionService>>;

  beforeEach(async () => {
    repository = {
      listTopicWatches: jest.fn(() =>
        Promise.resolve([
          {
            id: 'tw_1',
            name: 'AI 与科技',
          },
        ] as never),
      ),
      createTopicWatch: jest.fn((input) =>
        Promise.resolve({
          id: 'tw_created',
          ...input,
        } as never),
      ),
      findTopicWatchById: jest.fn(() =>
        Promise.resolve({
          id: 'tw_1',
          name: 'AI 与科技',
        } as never),
      ),
      listCandidates: jest.fn(() => Promise.resolve([])),
      listDecisions: jest.fn(() => Promise.resolve([])),
      createMonitoringPlan: jest.fn((input) =>
        Promise.resolve({
          id: 'plan_1',
          ...input,
        } as never),
      ),
    };
    collectionService = {
      collect: jest.fn(() =>
        Promise.resolve({
          topicWatchCount: 1,
          sourceCount: 1,
          rawItemCount: 3,
          signalCount: 3,
          evidenceCount: 3,
          candidateCount: 1,
          runs: [],
        }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TopicWatchController],
      providers: [
        {
          provide: TopicWatchRepository,
          useValue: repository,
        },
        {
          provide: TopicWatchAgentService,
          useValue: {
            evaluate: jest.fn(() =>
              Promise.resolve({
                id: 'decision_1',
                decision: 'continue_monitoring',
              }),
            ),
          },
        },
        {
          provide: TopicWatchCollectionService,
          useValue: collectionService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists topic watches', async () => {
    const response = await request(app.getHttpServer())
      .get('/topic-watches')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'tw_1',
        name: 'AI 与科技',
      }),
    ]);
  });

  it('creates a topic watch', async () => {
    await request(app.getHttpServer())
      .post('/topic-watches')
      .send({
        name: 'Crypto',
        domains: ['crypto'],
        watchIntent: '发现热点机会',
      })
      .expect(201);

    expect(repository.createTopicWatch).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Crypto',
        domains: ['crypto'],
        watchIntent: '发现热点机会',
      }),
    );
  });

  it('creates a monitoring plan draft', async () => {
    await request(app.getHttpServer())
      .post('/topic-watches/tw_1/monitoring-plans')
      .send({
        version: 1,
        sources: [{ sourceType: 'x_account' }],
        refreshPolicy: { frequency: '2h' },
      })
      .expect(201);

    expect(repository.createMonitoringPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatchId: 'tw_1',
        version: 1,
      }),
    );
  });

  it('collects all active topic watches', async () => {
    const response = await request(app.getHttpServer())
      .post('/topic-watches/collect')
      .expect(201);

    expect(collectionService.collect).toHaveBeenCalledWith({});
    expect(response.body).toEqual(
      expect.objectContaining({
        topicWatchCount: 1,
        rawItemCount: 3,
      }),
    );
  });

  it('collects one topic watch', async () => {
    await request(app.getHttpServer())
      .post('/topic-watches/tw_1/collect')
      .expect(201);

    expect(collectionService.collect).toHaveBeenCalledWith({
      topicWatchId: 'tw_1',
    });
  });
});

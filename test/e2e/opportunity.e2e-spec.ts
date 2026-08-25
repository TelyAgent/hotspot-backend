import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { OpportunityMiningAgentService } from '../../src/opportunity/mining/opportunity-mining-agent.service';
import { OpportunityController } from '../../src/opportunity/opportunity.controller';
import { OpportunityRepository } from '../../src/opportunity/opportunity.repository';

describe('Opportunity API', () => {
  let app: INestApplication;
  let repository: jest.Mocked<Partial<OpportunityRepository>>;

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
      listEvents: jest.fn(() => Promise.resolve([])),
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

    const moduleRef = await Test.createTestingModule({
      controllers: [OpportunityController],
      providers: [
        {
          provide: OpportunityRepository,
          useValue: repository,
        },
        {
          provide: OpportunityMiningAgentService,
          useValue: {
            evaluate: jest.fn(() =>
              Promise.resolve({
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
              }),
            ),
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

  it('mines and persists an opportunity decision', async () => {
    await request(app.getHttpServer())
      .post('/opportunities/mine')
      .send({
        instruction: '从证据里挖掘机会',
      })
      .expect(201);

    expect(repository.createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'AI 产品机会',
        status: 'suggested',
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

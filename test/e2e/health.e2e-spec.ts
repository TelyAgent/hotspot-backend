import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';

describe('Health API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            health: jest.fn(() =>
              Promise.resolve({
                status: 'ok',
                service: 'hotspot-agent-backend',
                checks: {
                  database: {
                    status: 'ok',
                  },
                  tools: {
                    status: 'ok',
                    count: 1,
                    names: ['signal.search'],
                  },
                  modelProvider: {
                    status: 'not_configured',
                    provider: 'openai',
                  },
                },
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

  it('returns service health', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            status: 'ok',
            service: 'hotspot-agent-backend',
            checks: expect.any(Object),
          }),
        );
      });
  });
});

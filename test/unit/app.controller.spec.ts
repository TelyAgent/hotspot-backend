import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';

describe('AppController', () => {
  it('exposes healthz as the same health check used by health', async () => {
    const health = {
      status: 'ok',
      service: 'hotspot-agent-backend',
      checks: {},
    };
    const service = {
      health: jest.fn(() => Promise.resolve(health)),
    } as unknown as AppService;
    const controller = new AppController(service);

    await expect(controller.healthz()).resolves.toBe(health);
    expect(service.health).toHaveBeenCalledTimes(1);
  });
});

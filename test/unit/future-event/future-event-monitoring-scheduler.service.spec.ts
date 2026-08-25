import { ConfigService } from '@nestjs/config';
import { FutureEventMonitoringExecutionService } from '../../../src/future-event/monitoring/future-event-monitoring-execution.service';
import { FutureEventMonitoringSchedulerService } from '../../../src/future-event/monitoring/future-event-monitoring-scheduler.service';

describe('FutureEventMonitoringSchedulerService', () => {
  it('runs due monitoring plans once per configured interval', async () => {
    const executionService = {
      runDuePlans: jest.fn(() =>
        Promise.resolve({
          planCount: 1,
          collectionRunCount: 0,
          signalCount: 0,
          runs: [],
        }),
      ),
    } as unknown as FutureEventMonitoringExecutionService;
    const config = {
      get: jest.fn((key: string) =>
        key === 'FUTURE_EVENT_MONITORING_INTERVAL_MS' ? '7200000' : undefined,
      ),
    } as unknown as ConfigService;
    const scheduler = new FutureEventMonitoringSchedulerService(
      config,
      executionService,
    );

    await scheduler.runDueExecution(new Date('2026-09-09T12:00:00.000Z'));
    await scheduler.runDueExecution(new Date('2026-09-09T13:00:00.000Z'));
    await scheduler.runDueExecution(new Date('2026-09-09T14:00:00.000Z'));

    expect(executionService.runDuePlans).toHaveBeenCalledTimes(2);
    expect(executionService.runDuePlans).toHaveBeenNthCalledWith(1, {
      observedAt: new Date('2026-09-09T12:00:00.000Z'),
    });
    expect(executionService.runDuePlans).toHaveBeenNthCalledWith(2, {
      observedAt: new Date('2026-09-09T14:00:00.000Z'),
    });
  });
});

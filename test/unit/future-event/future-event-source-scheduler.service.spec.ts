import { ConfigService } from '@nestjs/config';
import { FutureEventSourceDiscoveryAgentService } from '../../../src/future-event/source/future-event-source-discovery-agent.service';
import { FutureEventSourceSchedulerService } from '../../../src/future-event/source/future-event-source-scheduler.service';
import { FutureEventSourceService } from '../../../src/future-event/source/future-event-source.service';
import { FutureEventSourceStrategyService } from '../../../src/future-event/source/future-event-source-strategy.service';

describe('FutureEventSourceSchedulerService', () => {
  it('generates and runs a source plan from Markdown when no active source plan exists', async () => {
    const plan = {
      id: 'source_plan_1',
      version: 1,
      status: 'active',
      refreshPolicy: {
        intervalMs: 86400000,
      },
    };
    const sourceService = {
      findActiveSourcePlan: jest.fn(() => Promise.resolve(null)),
      latestActiveSourcePlanRunStartedAt: jest.fn(() => Promise.resolve(null)),
      collectActiveSourcePlan: jest.fn(() =>
        Promise.resolve({
          planId: 'source_plan_1',
          sourceCount: 1,
          signalCount: 1,
          candidateCount: 1,
        }),
      ),
    } as unknown as FutureEventSourceService;
    const strategyService = {
      readStrategy: jest.fn(() =>
        Promise.resolve({
          markdown: '# 未来事件来源策略',
        }),
      ),
    } as unknown as FutureEventSourceStrategyService;
    const sourceDiscoveryAgent = {
      generatePlanFromStrategy: jest.fn(() => Promise.resolve(plan)),
    } as unknown as FutureEventSourceDiscoveryAgentService;
    const scheduler = new FutureEventSourceSchedulerService(
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      sourceService,
      strategyService,
      sourceDiscoveryAgent,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T00:00:00.000Z'));

    expect(sourceService.findActiveSourcePlan).toHaveBeenCalled();
    expect(sourceDiscoveryAgent.generatePlanFromStrategy).toHaveBeenCalledWith({
      strategyMarkdown: '# 未来事件来源策略',
      activate: true,
    });
    expect(sourceService.collectActiveSourcePlan).toHaveBeenCalledWith(
      new Date('2026-08-25T00:00:00.000Z'),
    );
  });

  it('runs the active source plan when one exists', async () => {
    const plan = {
      id: 'source_plan_1',
      version: 1,
      status: 'active',
      refreshPolicy: {
        intervalMs: 86400000,
      },
    };
    const sourceService = {
      findActiveSourcePlan: jest.fn(() => Promise.resolve(plan)),
      latestActiveSourcePlanRunStartedAt: jest.fn(() => Promise.resolve(null)),
      collectActiveSourcePlan: jest.fn(() =>
        Promise.resolve({
          planId: 'source_plan_1',
          sourceCount: 1,
          signalCount: 1,
          candidateCount: 1,
        }),
      ),
    } as unknown as FutureEventSourceService;
    const scheduler = new FutureEventSourceSchedulerService(
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      sourceService,
      {} as FutureEventSourceStrategyService,
      {} as FutureEventSourceDiscoveryAgentService,
    );

    await scheduler.runDueCollection(new Date('2026-08-25T00:00:00.000Z'));

    expect(sourceService.collectActiveSourcePlan).toHaveBeenCalledWith(
      new Date('2026-08-25T00:00:00.000Z'),
    );
  });
});

import { DomainError } from '../../../src/common/errors/domain-error';
import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { FutureEventMonitoringAgentService } from '../../../src/future-event/monitoring/future-event-monitoring-agent.service';
import { FutureEventMonitoringPlanService } from '../../../src/future-event/monitoring/future-event-monitoring-plan.service';
import { FutureEvent } from '../../../src/future-event/future-event.types';
import { FutureEventRepository } from '../../../src/future-event/future-event.repository';

describe('FutureEventMonitoringAgentService', () => {
  it('generates a draft monitoring plan from an agent decision', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            monitoringStartAt: '2026-09-01T00:00:00.000Z',
            monitoringEndAt: '2026-09-08T00:00:00.000Z',
            phases: [
              {
                name: 'preheat',
                startAt: '2026-09-01T00:00:00.000Z',
                endAt: '2026-09-05T00:00:00.000Z',
                sources: [
                  {
                    sourceType: 'x_search',
                    platform: 'x',
                    query: 'FOMC rate decision',
                    frequency: '2h',
                    fields: ['postId', 'text', 'url', 'metrics'],
                    reason: '需要观察事件前讨论升温。',
                  },
                ],
              },
            ],
            triggerRules: [
              {
                id: 'rule_1',
                name: '讨论升温',
                description: '多个独立来源讨论事件。',
                action: 'create_opportunity',
                conditionText: '48 小时内出现多个独立来源讨论。',
                requiredSignals: ['x_search'],
              },
            ],
            expectedContentAngles: ['解释市场为什么关注本次议息会议'],
            evidenceRefs: ['ev_1'],
            confidence: 'medium',
            missingData: [],
            riskNotes: ['需要等待官方公告。'],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const monitoringPlanService = {
      createDraft: jest.fn((input) =>
        Promise.resolve({
          id: 'plan_1',
          ...input,
          status: 'draft',
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          updatedAt: new Date('2026-08-24T10:00:00.000Z'),
        }),
      ),
    } as unknown as FutureEventMonitoringPlanService;
    const service = new FutureEventMonitoringAgentService(
      workflowEngine,
      createFutureEventRepository(),
      monitoringPlanService,
    );

    const result = await service.generatePlan({
      futureEvent: createFutureEvent(),
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'future_event_monitoring',
        maxSteps: 5,
      }),
    );
    expect(monitoringPlanService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        futureEventId: 'fe_1',
        monitoringStartAt: new Date('2026-09-01T00:00:00.000Z'),
        monitoringEndAt: new Date('2026-09-08T00:00:00.000Z'),
        confidence: 'medium',
      }),
    );
    expect(result.status).toBe('draft');
  });

  it('throws a domain error when the agent fails', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'failed',
          errorMessage: 'model failed',
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const monitoringPlanService = {
      createDraft: jest.fn(),
    } as unknown as FutureEventMonitoringPlanService;
    const service = new FutureEventMonitoringAgentService(
      workflowEngine,
      createFutureEventRepository(),
      monitoringPlanService,
    );

    await expect(
      service.generatePlan({
        futureEvent: createFutureEvent(),
      }),
    ).rejects.toThrow(DomainError);
    expect(monitoringPlanService.createDraft).not.toHaveBeenCalled();
  });

  it('throws a domain error when the decision is missing required fields', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            monitoringStartAt: '2026-09-01T00:00:00.000Z',
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const monitoringPlanService = {
      createDraft: jest.fn(),
    } as unknown as FutureEventMonitoringPlanService;
    const service = new FutureEventMonitoringAgentService(
      workflowEngine,
      createFutureEventRepository(),
      monitoringPlanService,
    );

    await expect(
      service.generatePlan({
        futureEvent: createFutureEvent(),
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'FUTURE_EVENT_MONITORING_DECISION_INVALID',
      }),
    );
  });
});

function createFutureEvent(): FutureEvent {
  return {
    id: 'fe_1',
    title: 'FOMC 利率决议',
    eventType: 'economic_data',
    scheduledAt: new Date('2026-09-05T18:00:00.000Z'),
    startAt: null,
    endAt: null,
    domains: ['macro_finance'],
    summary: '美联储公布利率决议。',
    whyItMatters: '影响市场预期。',
    status: 'confirmed',
    createdFrom: 'manual',
    confidence: 'high',
    metadata: null,
    createdAt: new Date('2026-08-24T10:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
  };
}

function createFutureEventRepository(): FutureEventRepository {
  return {
    findEventById: jest.fn(() => Promise.resolve(createFutureEvent())),
  } as unknown as FutureEventRepository;
}

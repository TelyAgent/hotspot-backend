import { AgentWorkflowEngine } from '../../../src/agent/workflow-engine/agent-workflow-engine.interface';
import { FutureEventDiscoveryAgentService } from '../../../src/future-event/discovery/future-event-discovery-agent.service';
import { FutureEventRepository } from '../../../src/future-event/future-event.repository';

describe('FutureEventDiscoveryAgentService', () => {
  it('persists future event candidates from an agent decision over collected signals', async () => {
    const workflowEngine = {
      run: jest.fn(() =>
        Promise.resolve({
          runId: 'run_1',
          status: 'succeeded',
          result: {
            candidates: [
              {
                title: 'CPI 发布',
                eventType: 'economic_data',
                scheduledAt: '2026-09-10T12:30:00.000Z',
                domains: ['macro_finance'],
                summary: 'BLS 将发布 CPI 数据。',
                whyItMatters: '会影响市场和预测市场讨论。',
                recommendedMonitoringStartAt: '2026-09-08T00:00:00.000Z',
                recommendedMonitoringEndAt: '2026-09-11T00:00:00.000Z',
                suggestedKeywords: ['CPI', 'inflation'],
                suggestedAccounts: ['BLS_gov'],
                suggestedPlatforms: ['x', 'youtube'],
                evidenceRefs: ['signal_1'],
                confidence: 'high',
                missingData: [],
                riskNotes: [],
              },
            ],
          },
        }),
      ),
    } as unknown as AgentWorkflowEngine;
    const repository = {
      upsertCandidate: jest.fn((input) =>
        Promise.resolve({
          id: 'candidate_1',
          ...input,
          createdAt: new Date('2026-08-25T00:00:00.000Z'),
          updatedAt: new Date('2026-08-25T00:00:00.000Z'),
        }),
      ),
    } as unknown as FutureEventRepository;
    const service = new FutureEventDiscoveryAgentService(workflowEngine, repository);

    const result = await service.discoverFromSignals({
      instruction: '从采集信号里发现未来事件候选。',
      signals: [
        {
          id: 'signal_1',
          title: 'CPI for All Urban Consumers',
          summary: 'Consumer Price Index release',
          observedAt: new Date('2026-08-25T00:00:00.000Z'),
          metadata: {
            scheduledAt: '2026-09-10T12:30:00.000Z',
          },
        },
      ],
    });

    expect(workflowEngine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'future_event_discovery',
        maxSteps: 5,
        goal: expect.objectContaining({
          signals: [
            expect.objectContaining({
              id: 'signal_1',
              title: 'CPI for All Urban Consumers',
            }),
          ],
        }),
      }),
    );
    expect(repository.upsertCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'CPI 发布',
        eventType: 'economic_data',
        scheduledAt: new Date('2026-09-10T12:30:00.000Z'),
        evidenceRefs: ['signal_1'],
        status: 'new',
      }),
    );
    expect(result.candidateCount).toBe(1);
  });
});

import { FutureEventRepository } from '../../../src/future-event/future-event.repository';
import { FutureEventCandidateService } from '../../../src/future-event/candidate/future-event-candidate.service';
import { FutureEventMonitoringAgentService } from '../../../src/future-event/monitoring/future-event-monitoring-agent.service';

describe('FutureEventCandidateService', () => {
  it('confirms a candidate into a future event and generates a monitoring plan', async () => {
    const repository = {
      findCandidateById: jest.fn(() =>
        Promise.resolve({
          id: 'candidate_1',
          title: 'CPI 发布',
          eventType: 'economic_data',
          scheduledAt: new Date('2026-09-10T12:30:00.000Z'),
          timeRange: null,
          domains: ['macro_finance'],
          summary: 'BLS 将发布 CPI 数据。',
          whyItMatters: '会影响市场和预测市场讨论。',
          recommendedMonitoringStartAt: new Date('2026-09-08T00:00:00.000Z'),
          recommendedMonitoringEndAt: new Date('2026-09-11T00:00:00.000Z'),
          suggestedKeywords: ['CPI', 'inflation'],
          suggestedAccounts: ['BLS_gov'],
          suggestedPlatforms: ['x', 'youtube'],
          evidenceRefs: ['signal_1'],
          confidence: 'high',
          status: 'new',
          missingData: [],
          riskNotes: [],
          createdAt: new Date('2026-08-25T00:00:00.000Z'),
          updatedAt: new Date('2026-08-25T00:00:00.000Z'),
        }),
      ),
      createEvent: jest.fn((input) =>
        Promise.resolve({
          id: 'future_1',
          ...input,
          createdAt: new Date('2026-08-25T00:00:00.000Z'),
          updatedAt: new Date('2026-08-25T00:00:00.000Z'),
        }),
      ),
      updateCandidateStatus: jest.fn((input) =>
        Promise.resolve({
          id: input.id,
          status: input.status,
        }),
      ),
    } as unknown as FutureEventRepository;
    const monitoringAgent = {
      generateForEventId: jest.fn(() =>
        Promise.resolve({
          id: 'plan_1',
          futureEventId: 'future_1',
          status: 'draft',
        }),
      ),
    } as unknown as FutureEventMonitoringAgentService;
    const service = new FutureEventCandidateService(repository, monitoringAgent);

    const result = await service.confirmCandidate('candidate_1');

    expect(repository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'CPI 发布',
        eventType: 'economic_data',
        scheduledAt: new Date('2026-09-10T12:30:00.000Z'),
        domains: ['macro_finance'],
        createdFrom: 'future_event_candidate',
        confidence: 'high',
        metadata: expect.objectContaining({
          candidateId: 'candidate_1',
          evidenceRefs: ['signal_1'],
          suggestedKeywords: ['CPI', 'inflation'],
        }),
      }),
    );
    expect(repository.updateCandidateStatus).toHaveBeenCalledWith({
      id: 'candidate_1',
      status: 'confirmed',
    });
    expect(monitoringAgent.generateForEventId).toHaveBeenCalledWith(
      'future_1',
      expect.stringContaining('候选事件已确认'),
    );
    expect(result).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ id: 'future_1' }),
        monitoringPlan: expect.objectContaining({ id: 'plan_1' }),
      }),
    );
  });
});

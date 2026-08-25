import { FutureEventActionScoreService } from '../../../src/future-event/score/future-event-action-score.service';
import { FutureEvent, FutureEventCandidate } from '../../../src/future-event/future-event.types';

describe('FutureEventActionScoreService', () => {
  const service = new FutureEventActionScoreService();
  const observedAt = new Date('2026-08-25T00:00:00.000Z');

  it('scores a near high-confidence macro candidate with evidence and content readiness', () => {
    const candidate: FutureEventCandidate = {
      id: 'candidate_1',
      title: 'GDP (Second Estimate) and Corporate Profits, 2nd Quarter 2026',
      eventType: 'economic_data',
      scheduledAt: new Date('2026-08-26T12:30:00.000Z'),
      domains: ['macro', 'finance'],
      summary: 'BEA 官方日程中的未来事件。',
      whyItMatters: 'GDP 和企业利润会影响市场叙事。',
      suggestedKeywords: ['GDP', 'corporate profits'],
      suggestedAccounts: ['BEA_News'],
      suggestedPlatforms: ['x', 'youtube'],
      evidenceRefs: ['signal_1', 'signal_2'],
      confidence: 'high',
      status: 'new',
      missingData: [],
      riskNotes: [],
      createdAt: observedAt,
      updatedAt: observedAt,
    };

    expect(service.scoreCandidate(candidate, { observedAt })).toEqual({
      total: 67,
      impact: {
        scope: 10,
        relevance: 8,
        outcomeImportance: 10,
      },
      evidence: 19,
      heatMomentum: 0,
      timeUrgency: 10,
      contentReadiness: 10,
      version: 'future-event-action-score@v1',
    });
  });

  it('penalizes distant low-confidence candidates with missing data and risk notes', () => {
    const candidate: FutureEventCandidate = {
      id: 'candidate_2',
      title: 'Unconfirmed industry webinar',
      eventType: 'industry_event',
      scheduledAt: new Date('2026-12-20T00:00:00.000Z'),
      domains: ['unknown'],
      summary: '',
      whyItMatters: '',
      suggestedKeywords: [],
      suggestedAccounts: [],
      suggestedPlatforms: [],
      evidenceRefs: [],
      confidence: 'low',
      status: 'new',
      missingData: ['sourceUrl', 'exactTime'],
      riskNotes: ['时间待确认'],
      createdAt: observedAt,
      updatedAt: observedAt,
    };

    expect(service.scoreCandidate(candidate, { observedAt })).toEqual({
      total: 11,
      impact: {
        scope: 4,
        relevance: 3,
        outcomeImportance: 3,
      },
      evidence: 1,
      heatMomentum: 0,
      timeUrgency: 0,
      contentReadiness: 0,
      version: 'future-event-action-score@v1',
    });
  });

  it('scores confirmed events from metadata evidence', () => {
    const event: FutureEvent = {
      id: 'future_1',
      title: 'FOMC meeting September 15-16, 2026',
      eventType: 'policy_meeting',
      scheduledAt: new Date('2026-09-15T00:00:00.000Z'),
      startAt: null,
      endAt: null,
      domains: ['macro', 'policy'],
      summary: 'Federal Reserve official calendar event.',
      whyItMatters: '利率决议会影响市场预期。',
      status: 'confirmed',
      createdFrom: 'future_event_candidate',
      confidence: 'high',
      metadata: {
        evidence: [
          {
            id: 'evidence_1',
            sourceType: 'fomc',
            url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
          },
        ],
      },
      createdAt: observedAt,
      updatedAt: observedAt,
    };

    expect(service.scoreEvent(event, { observedAt })).toMatchObject({
      total: 63,
      impact: {
        scope: 10,
        relevance: 8,
        outcomeImportance: 10,
      },
      evidence: 17,
      heatMomentum: 0,
      timeUrgency: 8,
      contentReadiness: 10,
      version: 'future-event-action-score@v1',
    });
  });
});

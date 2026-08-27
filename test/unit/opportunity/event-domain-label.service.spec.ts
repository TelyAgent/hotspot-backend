import { EventDomainLabelService } from '../../../src/opportunity/labeling/event-domain-label.service';

describe('EventDomainLabelService', () => {
  it('labels prediction market evidence with the fixed domain label', () => {
    const service = new EventDomainLabelService();

    const labels = service.buildDomainLabels({
      evidence: [
        {
          id: 'ev_1',
          sourceType: 'x_post',
          claim: 'Polymarket 上某预测市场概率出现明显变化。',
          text: 'Polymarket odds moved sharply after the debate.',
          confidence: 'high',
        },
      ],
      topicDomains: [],
      agentSuggestedDomains: [],
    });

    expect(labels).toEqual([
      expect.objectContaining({
        code: 'Prediction Markets',
        name: 'Prediction Markets',
        category: 'domain',
        evidenceRefs: ['ev_1'],
      }),
    ]);
  });

  it('labels official economic schedules with official schedule and macro markets', () => {
    const service = new EventDomainLabelService();

    const labels = service.buildDomainLabels({
      evidence: [
        {
          id: 'ev_1',
          sourceType: 'fomc',
          claim: 'FOMC meeting 已列入官方日程。',
          text: 'FOMC meeting',
          confidence: 'high',
        },
      ],
      topicDomains: [],
      agentSuggestedDomains: [],
    });

    expect(labels.map((label) => label.code)).toEqual([
      'Official Schedule',
      'Macro & Financial Markets',
    ]);
  });

  it('ignores domains outside the fixed set', () => {
    const service = new EventDomainLabelService();

    const labels = service.buildDomainLabels({
      evidence: [],
      topicDomains: ['Entertainment'],
      agentSuggestedDomains: ['Random Domain'],
    });

    expect(labels).toEqual([]);
  });
});

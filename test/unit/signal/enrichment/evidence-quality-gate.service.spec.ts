import { EvidenceQualityGateService } from '../../../../src/signal/enrichment/evidence-quality-gate.service';

describe('EvidenceQualityGateService', () => {
  it('marks x trend keyword-only evidence as thin and not event-ready', () => {
    const service = new EvidenceQualityGateService();

    const result = service.evaluate({
      signalType: 'x_trend',
      evidenceItems: [
        {
          id: 'ev_1',
          sourceType: 'x_trend',
          claim: '아가미 무대인사 出现在 Korea X 热榜。',
          text: '아가미 무대인사',
          url: 'https://x.com/search?q=test',
          confidence: 'medium',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        level: 'thin',
        canCreateEvent: false,
        canUseHighConfidence: false,
        hasOpenableSource: true,
        hasReasonEvidence: false,
      }),
    );
    expect(result.missingData).toContain(
      '缺少解释热搜原因的相关帖子或外部来源。',
    );
    expect(result.riskNotes).toContain(
      '当前只有热搜榜信号，不能直接当成现实事件事实。',
    );
  });

  it('marks x trend with related posts as usable event evidence', () => {
    const service = new EvidenceQualityGateService();

    const result = service.evaluate({
      signalType: 'x_trend',
      evidenceItems: [
        {
          id: 'ev_1',
          sourceType: 'x_trend',
          claim: 'OpenAI 出现在 United States X 热榜。',
          text: 'OpenAI',
          url: 'https://x.com/search?q=OpenAI',
          confidence: 'medium',
        },
        {
          id: 'ev_2',
          sourceType: 'x_trend_related_post',
          claim: 'OpenAI 官方账号发布 API 更新。',
          text: 'We updated the API today for developers.',
          url: 'https://x.com/OpenAI/status/1',
          author: 'OpenAI',
          confidence: 'high',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        level: 'usable',
        canCreateEvent: true,
        hasReasonEvidence: true,
        hasActorActionObject: true,
      }),
    );
  });

  it('treats topic watch account posts as usable reason evidence', () => {
    const service = new EvidenceQualityGateService();

    const result = service.evaluate({
      signalType: 'x_post',
      evidenceItems: [
        {
          id: 'ev_topic_post',
          sourceType: 'x_account_post',
          claim: 'Polymarket 发布了帖子。',
          text: 'Polymarket 发布了新的预测市场说明，引发用户讨论。',
          url: 'https://x.com/Polymarket/status/1',
          author: 'Polymarket',
          confidence: 'high',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        level: 'usable',
        canCreateEvent: true,
        hasReasonEvidence: true,
      }),
    );
  });
});

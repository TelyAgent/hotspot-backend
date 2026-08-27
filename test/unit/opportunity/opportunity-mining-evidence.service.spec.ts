import { SignalEvidenceEnrichmentService } from '../../../src/signal/enrichment/signal-evidence-enrichment.service';
import { OpportunityMiningEvidenceService } from '../../../src/opportunity/mining/opportunity-mining-evidence.service';

describe('OpportunityMiningEvidenceService', () => {
  it('enriches seed signals before returning evidence memory', async () => {
    const prisma = {
      signal: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'sig_1',
              signalType: 'x_trend',
              source: 'x',
              title: 'Polymarket',
              observedAt: new Date('2026-08-27T00:00:00.000Z'),
            },
          ]),
        ),
      },
      evidenceItem: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'ev_1',
              signalId: 'sig_1',
              sourceType: 'x_trend',
              claim: 'Polymarket 进入 United States X 热榜。',
              confidence: 'high',
              observedAt: new Date('2026-08-27T00:00:00.000Z'),
            },
          ]),
        ),
      },
    };
    const enrichmentService = {
      enrich: jest.fn(() =>
        Promise.resolve({
          signalId: 'sig_1',
          signalType: 'x_trend',
          evidenceRefs: ['ev_1'],
          evidenceItems: [
            {
              id: 'ev_1',
              signalId: 'sig_1',
              sourceType: 'x_trend',
              claim: 'Polymarket 进入 United States X 热榜。',
              confidence: 'high',
              observedAt: new Date('2026-08-27T00:00:00.000Z'),
            },
          ],
          qualityGate: {
            level: 'thin',
            canCreateEvent: false,
            canUseHighConfidence: false,
            hasOpenableSource: true,
            hasReasonEvidence: false,
            hasActorActionObject: false,
            missingData: ['缺少解释热搜原因的相关帖子或外部来源。'],
            riskNotes: ['当前只有热搜榜信号，不能直接当成现实事件事实。'],
          },
          conservativeTitle: 'United States X 热搜：Polymarket',
          domainLabels: [
            {
              code: 'Prediction Markets',
              name: 'Prediction Markets',
              category: 'domain',
              evidenceRefs: ['ev_1'],
              reason: '证据内容命中 Prediction Markets 领域。',
              confidence: 'medium',
            },
          ],
          enrichmentSummary: '缺少解释热搜原因的相关帖子或外部来源。',
        }),
      ),
    } as unknown as SignalEvidenceEnrichmentService;
    const service = new OpportunityMiningEvidenceService(
      prisma as never,
      enrichmentService,
    );

    const memory = await service.load({
      seedSignalIds: ['sig_1'],
    });

    expect(enrichmentService.enrich).toHaveBeenCalledWith({
      signalId: 'sig_1',
      mode: 'before_opportunity_mining',
      maxEvidence: 20,
    });
    expect(memory.enrichedPackages).toHaveLength(1);
    expect(memory.missingData).toContain(
      '缺少解释热搜原因的相关帖子或外部来源。',
    );
  });
});

import { SignalEvidenceEnrichmentService } from '../../../src/signal/enrichment/signal-evidence-enrichment.service';
import { EvidenceRepository } from '../../../src/signal/evidence/evidence.repository';
import { SignalController } from '../../../src/signal/signal.controller';
import { SignalRepository } from '../../../src/signal/signal/signal.repository';

describe('SignalController', () => {
  it('returns enriched evidence package for a signal', async () => {
    const enrichmentService = {
      enrich: jest.fn(() =>
        Promise.resolve({
          signalId: 'sig_1',
          signalType: 'x_trend',
          evidenceRefs: ['ev_1'],
          evidenceItems: [],
          qualityGate: {
            level: 'thin',
            canCreateEvent: false,
            canUseHighConfidence: false,
            hasOpenableSource: false,
            hasReasonEvidence: false,
            hasActorActionObject: false,
            missingData: ['缺少解释热搜原因的相关帖子或外部来源。'],
            riskNotes: ['当前只有热搜榜信号，不能直接当成现实事件事实。'],
          },
          conservativeTitle: 'United States X 热搜：OpenAI',
          domainLabels: [],
          enrichmentSummary: '缺少解释热搜原因的相关帖子或外部来源。',
        }),
      ),
    } as unknown as SignalEvidenceEnrichmentService;
    const controller = new SignalController(
      {
        findMany: jest.fn(),
        findById: jest.fn(),
      } as unknown as SignalRepository,
      {
        findByIds: jest.fn(),
        findMany: jest.fn(),
      } as unknown as EvidenceRepository,
      enrichmentService,
    );

    const result = await controller.getEnrichment('sig_1', '3');

    expect(enrichmentService.enrich).toHaveBeenCalledWith({
      signalId: 'sig_1',
      mode: 'manual_refresh',
      maxEvidence: 3,
    });
    expect(result).toEqual(
      expect.objectContaining({
        signalId: 'sig_1',
        qualityGate: expect.objectContaining({
          canCreateEvent: false,
        }),
      }),
    );
  });
});

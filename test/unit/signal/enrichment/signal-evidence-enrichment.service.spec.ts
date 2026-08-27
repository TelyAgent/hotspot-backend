import { EvidenceQualityGateService } from '../../../../src/signal/enrichment/evidence-quality-gate.service';
import { SignalEvidenceEnrichmentService } from '../../../../src/signal/enrichment/signal-evidence-enrichment.service';
import { EventDomainLabelService } from '../../../../src/opportunity/labeling/event-domain-label.service';

describe('SignalEvidenceEnrichmentService', () => {
  it('loads existing signal evidence and returns a quality gate', async () => {
    const prisma = {
      signal: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sig_1',
          signalType: 'x_trend',
          title: 'OpenAI',
          metadata: { region: 'United States' },
        }),
      },
      evidenceItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ev_1',
            signalId: 'sig_1',
            sourceType: 'x_trend',
            claim: 'OpenAI 出现在 United States X 热榜。',
            text: 'OpenAI',
            url: 'https://x.com/search?q=OpenAI',
            confidence: 'medium',
            observedAt: new Date('2026-08-26T07:17:17.684Z'),
          },
        ]),
      },
    };
    const service = new SignalEvidenceEnrichmentService(
      prisma as never,
      new EvidenceQualityGateService(),
      new EventDomainLabelService(),
      [],
    );

    const result = await service.enrich({
      signalId: 'sig_1',
      mode: 'before_opportunity_mining',
    });

    expect(result.signalId).toBe('sig_1');
    expect(result.signalType).toBe('x_trend');
    expect(result.evidenceRefs).toEqual(['ev_1']);
    expect(result.qualityGate.canCreateEvent).toBe(false);
    expect(result.conservativeTitle).toBe('United States X 热搜：OpenAI');
  });

  it('throws a domain error when signal does not exist', async () => {
    const prisma = {
      signal: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new SignalEvidenceEnrichmentService(
      prisma as never,
      new EvidenceQualityGateService(),
      new EventDomainLabelService(),
      [],
    );

    await expect(
      service.enrich({
        signalId: 'missing_signal',
        mode: 'before_opportunity_mining',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'SIGNAL_NOT_FOUND',
      }),
    );
  });
});

import { OpportunityRulePackLoaderService } from '../../../src/opportunity/rule-pack/opportunity-rule-pack-loader.service';

describe('OpportunityRulePackLoaderService', () => {
  it('loads the default active rule pack', async () => {
    const service = new OpportunityRulePackLoaderService();

    const rulePack = await service.loadActiveRulePack();

    expect(rulePack.status).toBe('active');
    expect(rulePack.documents.map((document) => document.id)).toEqual(
      expect.arrayContaining([
        'global-principles',
        'source-routing',
        'x-trend-rules',
        'dedupe-and-evidence-rules',
        'output-policy',
      ]),
    );
    expect(rulePack.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signalType: 'x_trend',
          documents: expect.arrayContaining(['x-trend-rules']),
        }),
      ]),
    );
  });

  it('selects x trend rule documents from source routing', async () => {
    const service = new OpportunityRulePackLoaderService();
    const rulePack = await service.loadActiveRulePack();

    const documents = service.selectDocuments({
      signalType: 'x_trend',
      goalType: 'detect_opportunity',
      rulePack,
    });

    expect(documents.map((document) => document.id)).toEqual([
      'global-principles',
      'source-routing',
      'x-trend-rules',
      'product-angle-rules',
      'dedupe-and-evidence-rules',
      'output-policy',
    ]);
  });

  it('falls back to default rule documents for unknown signal types', async () => {
    const service = new OpportunityRulePackLoaderService();
    const rulePack = await service.loadActiveRulePack();

    const documents = service.selectDocuments({
      signalType: 'unknown_source',
      goalType: 'detect_opportunity',
      rulePack,
    });

    expect(documents.map((document) => document.id)).toEqual([
      'global-principles',
      'source-routing',
      'dedupe-and-evidence-rules',
      'output-policy',
    ]);
  });
});


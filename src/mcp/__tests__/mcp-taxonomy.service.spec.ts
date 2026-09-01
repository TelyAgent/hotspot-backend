import { McpTaxonomyService } from '../mcp-taxonomy.service';

describe('McpTaxonomyService', () => {
  it('returns fixed hotspot taxonomy for external agents', () => {
    const service = new McpTaxonomyService();

    expect(service.getTaxonomy()).toMatchObject({
      entities: expect.arrayContaining([
        expect.objectContaining({ name: 'Signal' }),
        expect.objectContaining({ name: 'Event' }),
        expect.objectContaining({ name: 'Evidence' }),
      ]),
      eventDomains: [
        'AI',
        'Technology',
        'Politics & Elections',
        'Geopolitics & Conflict',
        'Macro & Financial Markets',
        'Crypto & Web3',
        'Prediction Markets',
        'Official Schedule',
      ],
      sourceAndHeatLabels: expect.arrayContaining([
        expect.objectContaining({ name: 'X Trend' }),
        expect.objectContaining({ name: 'Topic Circle' }),
        expect.objectContaining({ name: 'Future Event' }),
        expect.objectContaining({ name: '第一方确认' }),
      ]),
    });
  });
});

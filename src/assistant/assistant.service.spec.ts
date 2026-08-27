import { AssistantService } from './assistant.service';

describe('AssistantService', () => {
  it('answers X trend collection regions from project config when workflow engine is unavailable', async () => {
    const service = new AssistantService(
      {
        getXTrendCollectionConfig: jest.fn().mockResolvedValue({
          regions: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
          limit: 30,
          collectionIntervalMs: 7_200_000,
        }),
      } as never,
      {
        listTopicWatches: jest.fn(),
      } as never,
      undefined,
    );

    const response = await service.chat({
      message: '当前X热榜采集的地区有哪些？',
      context: { page: 'settings' },
    });

    expect(response.message).toContain('global');
    expect(response.message).toContain('United States');
    expect(response.message).toContain('United Kingdom');
    expect(response.message).toContain('Japan');
    expect(response.message).toContain('Korea');
  });
});

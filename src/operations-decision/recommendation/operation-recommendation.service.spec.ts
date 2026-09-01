import { ConfigService } from '@nestjs/config';
import { OperationRecommendationService } from './operation-recommendation.service';

describe('OperationRecommendationService', () => {
  it('adopts a selected angle and records the operator decision', async () => {
    const repository = {
      findRecommendationById: jest.fn().mockResolvedValue({
        id: 'rec_1',
        sourceEventId: 'event_1',
        predxNewsItemId: 'news_1',
        angles: [
          {
            id: 'angle_1',
            claim: '从市场概率变化切入，解释热点对用户判断的影响。',
          },
        ],
      }),
      recordRecommendationDecision: jest.fn().mockResolvedValue({
        id: 'record_1',
        result: 'adopted',
        finalAngle: '从市场概率变化切入，解释热点对用户判断的影响。',
      }),
    };
    const service = new OperationRecommendationService(
      repository as never,
      {} as never,
      {} as never,
      new ConfigService(),
    );

    const record = await service.adoptRecommendation({
      recommendationId: 'rec_1',
      angleId: 'angle_1',
      operator: 'Rachel',
    });

    expect(record).toMatchObject({
      id: 'record_1',
      result: 'adopted',
      finalAngle: '从市场概率变化切入，解释热点对用户判断的影响。',
    });
    expect(repository.recordRecommendationDecision).toHaveBeenCalledWith({
      recommendationId: 'rec_1',
      result: 'adopted',
      recommendationStatus: 'adopted',
      finalAngle: '从市场概率变化切入，解释热点对用户判断的影响。',
      operator: 'Rachel',
      note: undefined,
      metadata: {
        angleId: 'angle_1',
        sourceEventId: 'event_1',
        predxNewsItemId: 'news_1',
      },
    });
  });
});

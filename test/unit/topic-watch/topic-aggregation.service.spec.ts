import { TopicAggregationService } from '../../../src/topic-watch/aggregation/topic-aggregation.service';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';
import { Signal } from '../../../src/signal/signal/signal.types';

describe('TopicAggregationService', () => {
  it('aggregates multiple account posts into one topic candidate by entity', async () => {
    const repository = {
      createCandidate: jest.fn((input) =>
        Promise.resolve({
          id: 'tc_1',
          ...input,
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          updatedAt: new Date('2026-08-24T10:00:00.000Z'),
        }),
      ),
    } as unknown as TopicWatchRepository;
    const service = new TopicAggregationService(repository);

    const candidates = await service.aggregate({
      topicWatchId: 'tw_1',
      windowStartAt: new Date('2026-08-24T10:00:00.000Z'),
      windowEndAt: new Date('2026-08-24T11:00:00.000Z'),
      signals: [
        createSignal({
          id: 'sig_1',
          title: 'OpenAI 发布新模型',
          authorHandle: 'OpenAI',
        }),
        createSignal({
          id: 'sig_2',
          title: 'Developers discuss OpenAI new model',
          authorHandle: 'ai_dev',
        }),
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(repository.createCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatchId: 'tw_1',
        signalCount: 2,
        postCount: 2,
        accountCount: 2,
        representativeSignalIds: ['sig_1', 'sig_2'],
        entities: ['OpenAI'],
      }),
    );
  });
});

function createSignal(input: {
  id: string;
  title: string;
  authorHandle: string;
}): Signal {
  return {
    id: input.id,
    rawItemId: `raw_${input.id}`,
    source: 'x',
    platform: 'x',
    signalType: 'x_post',
    title: input.title,
    summary: input.title,
    observedAt: new Date('2026-08-24T10:10:00.000Z'),
    rawRefs: [`raw_${input.id}`],
    metrics: null,
    metadata: {
      entities: ['OpenAI'],
      keywords: ['model', 'release'],
      authorHandles: [input.authorHandle],
    },
    createdAt: new Date('2026-08-24T10:10:00.000Z'),
    updatedAt: new Date('2026-08-24T10:10:00.000Z'),
  };
}

import { SignalRepository } from '../../../src/signal/signal/signal.repository';
import { SignalService } from '../../../src/signal/signal/signal.service';
import { RawItem } from '../../../src/signal/raw-item/raw-item.types';

describe('SignalService', () => {
  it('creates a signal from a raw item and preserves the raw item reference', async () => {
    const repository = {
      create: jest.fn((input) => ({
        id: 'sig_1',
        rawItemId: input.rawItem.connect.id,
        source: input.source,
        platform: input.platform,
        signalType: input.signalType,
        title: input.title,
        summary: input.summary,
        observedAt: input.observedAt,
        rawRefs: input.rawRefs,
        metrics: input.metrics,
        metadata: input.metadata,
        createdAt: new Date('2026-08-24T10:10:00.000Z'),
        updatedAt: new Date('2026-08-24T10:10:00.000Z'),
      })),
    } as unknown as SignalRepository;
    const service = new SignalService(repository);
    const rawItem: RawItem = {
      id: 'raw_1',
      source: 'x',
      sourceType: 'post',
      sourceItemId: 'post_1',
      observedAt: new Date('2026-08-24T10:34:56.000Z'),
      observedAtBucket: new Date('2026-08-24T10:00:00.000Z'),
      payload: {
        text: 'OpenAI released a new model.',
      },
      metadata: null,
      dedupeKey: 'x:post:post_1:2026-08-24T10:00:00.000Z',
      createdAt: new Date('2026-08-24T10:35:00.000Z'),
      updatedAt: new Date('2026-08-24T10:35:00.000Z'),
    };

    const result = await service.createFromRawItem({
      rawItem,
      platform: 'x',
      signalType: 'post',
      title: 'OpenAI released a new model',
      summary: 'OpenAI model release discussion.',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rawItem: {
          connect: {
            id: 'raw_1',
          },
        },
        source: 'x',
        platform: 'x',
        signalType: 'post',
        title: 'OpenAI released a new model',
        rawRefs: ['raw_1'],
      }),
    );
    expect(result.rawItemId).toBe('raw_1');
  });
});

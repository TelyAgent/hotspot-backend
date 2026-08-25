import { RawItemRepository } from '../../../src/signal/raw-item/raw-item.repository';
import { RawItemService } from '../../../src/signal/raw-item/raw-item.service';

describe('RawItemService', () => {
  it('creates a raw item with an hourly observedAt bucket and dedupe key', async () => {
    const repository = {
      upsertByDedupeKey: jest.fn((input) => ({
        id: 'raw_1',
        ...input,
        createdAt: new Date('2026-08-24T10:10:00.000Z'),
        updatedAt: new Date('2026-08-24T10:10:00.000Z'),
      })),
    } as unknown as RawItemRepository;
    const service = new RawItemService(repository);

    const result = await service.create({
      source: 'x',
      sourceType: 'post',
      sourceItemId: 'post_1',
      observedAt: new Date('2026-08-24T10:34:56.000Z'),
      payload: {
        text: 'OpenAI released a new model.',
      },
    });

    expect(repository.upsertByDedupeKey).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'x',
        sourceType: 'post',
        sourceItemId: 'post_1',
        observedAtBucket: new Date('2026-08-24T10:00:00.000Z'),
        dedupeKey: 'x:post:post_1:2026-08-24T10:00:00.000Z',
      }),
    );
    expect(result.id).toBe('raw_1');
  });

  it('uses a payload hash when the source item id is missing', async () => {
    const repository = {
      upsertByDedupeKey: jest.fn((input) => ({
        id: 'raw_2',
        ...input,
        createdAt: new Date('2026-08-24T10:10:00.000Z'),
        updatedAt: new Date('2026-08-24T10:10:00.000Z'),
      })),
    } as unknown as RawItemRepository;
    const service = new RawItemService(repository);

    await service.create({
      source: 'web',
      sourceType: 'article',
      observedAt: new Date('2026-08-24T10:34:56.000Z'),
      payload: {
        url: 'https://example.com/a',
      },
    });

    const call = repository.upsertByDedupeKey as jest.Mock;
    const input = call.mock.calls[0][0] as { dedupeKey: string };

    expect(input.dedupeKey).toMatch(
      /^web:article:[a-f0-9]{24}:2026-08-24T10:00:00\.000Z$/,
    );
  });
});

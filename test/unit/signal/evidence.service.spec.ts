import { EvidenceRepository } from '../../../src/signal/evidence/evidence.repository';
import { EvidenceService } from '../../../src/signal/evidence/evidence.service';
import { Signal } from '../../../src/signal/signal/signal.types';

describe('EvidenceService', () => {
  it('creates evidence from a signal with a raw reference', async () => {
    const repository = {
      create: jest.fn((input) => ({
        id: 'ev_1',
        signalId: input.signal.connect.id,
        sourceTool: input.sourceTool ?? null,
        sourceType: input.sourceType,
        sourceItemId: input.sourceItemId,
        claim: input.claim,
        text: input.text,
        url: input.url,
        author: input.author,
        publishedAt: input.publishedAt,
        observedAt: input.observedAt,
        metrics: input.metrics,
        confidence: input.confidence,
        rawRef: input.rawRef,
        metadata: input.metadata,
        createdAt: new Date('2026-08-24T10:10:00.000Z'),
        updatedAt: new Date('2026-08-24T10:10:00.000Z'),
      })),
    } as unknown as EvidenceRepository;
    const service = new EvidenceService(repository);
    const signal: Signal = {
      id: 'sig_1',
      rawItemId: 'raw_1',
      source: 'x',
      platform: 'x',
      signalType: 'post',
      title: 'OpenAI released a new model',
      summary: 'OpenAI model release discussion.',
      observedAt: new Date('2026-08-24T10:34:56.000Z'),
      rawRefs: ['raw_1'],
      metrics: null,
      metadata: null,
      createdAt: new Date('2026-08-24T10:35:00.000Z'),
      updatedAt: new Date('2026-08-24T10:35:00.000Z'),
    };

    const result = await service.createFromSignal({
      signal,
      sourceType: 'post',
      claim: 'OpenAI released a new model.',
      text: 'OpenAI released a new model.',
      url: 'https://x.com/OpenAI/status/post_1',
      confidence: 'high',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: {
          connect: {
            id: 'sig_1',
          },
        },
        sourceType: 'post',
        claim: 'OpenAI released a new model.',
        rawRef: 'raw_1',
        confidence: 'high',
      }),
    );
    expect(result.signalId).toBe('sig_1');
  });
});

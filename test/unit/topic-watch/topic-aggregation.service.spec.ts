import { TopicAggregationService } from '../../../src/topic-watch/aggregation/topic-aggregation.service';
import { TopicWatchRepository } from '../../../src/topic-watch/topic-watch.repository';
import { Signal } from '../../../src/signal/signal/signal.types';

describe('TopicAggregationService', () => {
  it('aggregates multiple account posts into one topic candidate by entity', async () => {
    const repository = {
      upsertCandidateByClusterKey: jest.fn((input) =>
        Promise.resolve({
          id: 'tc_1',
          ...input,
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          updatedAt: new Date('2026-08-24T10:00:00.000Z'),
        }),
      ),
      listRecentPostSignalsByAuthor: jest.fn(() => Promise.resolve([])),
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
    expect(repository.upsertCandidateByClusterKey).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatchId: 'tw_1',
        title: 'OpenAI 发布新模型',
        summary: '多个账号正在讨论 OpenAI 发布新模型等动态。',
        signalCount: 2,
        postCount: 2,
        accountCount: 2,
        representativeSignalIds: ['sig_1', 'sig_2'],
        entities: ['OpenAI'],
        metrics: expect.objectContaining({
          b3h: 2,
          b24h: 2,
          tmax: 140,
          tmaxSignalId: 'sig_2',
          tmaxTop5Percent: null,
        }),
      }),
    );
  });

  it('creates a Chinese one-sentence topic summary instead of copying post text', async () => {
    const repository = {
      upsertCandidateByClusterKey: jest.fn((input) =>
        Promise.resolve({
          id: 'tc_1',
          ...input,
          createdAt: new Date('2026-08-24T10:00:00.000Z'),
          updatedAt: new Date('2026-08-24T10:00:00.000Z'),
        }),
      ),
      listRecentPostSignalsByAuthor: jest.fn(() => Promise.resolve([])),
    } as unknown as TopicWatchRepository;
    const service = new TopicAggregationService(repository);

    await service.aggregate({
      topicWatchId: 'tw_1',
      windowStartAt: new Date('2026-08-24T10:00:00.000Z'),
      windowEndAt: new Date('2026-08-24T11:00:00.000Z'),
      signals: [
        createSignal({
          id: 'sig_1',
          title:
            'Polymarket: JUST IN: Over a third of British employers have reduced entry-level hiring due to AI.',
          authorHandle: 'Polymarket',
        }),
      ],
    });

    expect(repository.upsertCandidateByClusterKey).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '英国雇主因 AI 和自动化减少初级岗位招聘',
        summary: 'Polymarket 正在讨论英国雇主因 AI 和自动化减少初级岗位招聘。',
      }),
    );
  });
});

function createSignal(input: {
  id: string;
  title: string;
  authorHandle: string;
  metrics?: Record<string, number>;
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
    metrics: input.metrics ?? {
      likes: input.id === 'sig_2' ? 100 : 10,
      reposts: input.id === 'sig_2' ? 20 : 2,
      replies: input.id === 'sig_2' ? 20 : 1,
      views: input.id === 'sig_2' ? 1000 : 100,
    },
    metadata: {
      entities: ['OpenAI'],
      keywords: ['model', 'release'],
      authorHandles: [input.authorHandle],
    },
    createdAt: new Date('2026-08-24T10:10:00.000Z'),
    updatedAt: new Date('2026-08-24T10:10:00.000Z'),
  };
}

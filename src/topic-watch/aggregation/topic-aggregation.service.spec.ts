import { TopicAggregationService } from './topic-aggregation.service';
import { CreateTopicCandidateInput, TopicCandidate } from '../topic-watch.types';
import { Signal } from '../../signal/signal/signal.types';

describe('TopicAggregationService', () => {
  it('updates an existing candidate for the same clustered signals instead of creating duplicates', async () => {
    const repository = new InMemoryTopicCandidateRepository();
    const service = new TopicAggregationService(repository as never);
    const signals = [
      createSignal({
        id: 'sig_1',
        title: 'OpenAI announces GPT-5 pricing update',
        authorHandle: 'OpenAI',
        postId: 'post_1',
      }),
      createSignal({
        id: 'sig_2',
        title: 'OpenAI announces GPT-5 pricing update',
        authorHandle: 'sama',
        postId: 'post_2',
      }),
    ];

    await service.aggregate({
      topicWatchId: 'topic-ai-tech',
      windowStartAt: new Date('2026-08-25T00:00:00.000Z'),
      windowEndAt: new Date('2026-08-25T03:00:00.000Z'),
      signals,
    });
    await service.aggregate({
      topicWatchId: 'topic-ai-tech',
      windowStartAt: new Date('2026-08-25T00:00:00.000Z'),
      windowEndAt: new Date('2026-08-25T03:00:00.000Z'),
      signals,
    });

    expect(repository.createdCount).toBe(1);
    expect(repository.updatedCount).toBe(1);
    expect(repository.candidates).toHaveLength(1);
    expect(repository.candidates[0].representativeSignalIds).toEqual([
      'sig_1',
      'sig_2',
    ]);
  });

  it('counts one author once in B3h and B24h metrics', async () => {
    const repository = new InMemoryTopicCandidateRepository();
    const service = new TopicAggregationService(repository as never);

    const [candidate] = await service.aggregate({
      topicWatchId: 'topic-ai-tech',
      windowStartAt: new Date('2026-08-25T00:00:00.000Z'),
      windowEndAt: new Date('2026-08-25T03:00:00.000Z'),
      signals: [
        createSignal({
          id: 'sig_1',
          title: 'OpenAI announces GPT-5 pricing update',
          authorHandle: 'OpenAI',
          postId: 'post_1',
        }),
        createSignal({
          id: 'sig_2',
          title: 'OpenAI announces GPT-5 pricing update',
          authorHandle: 'OpenAI',
          postId: 'post_2',
        }),
      ],
    });

    expect(candidate.metrics.b3h).toBe(1);
    expect(candidate.metrics.b24h).toBe(1);
  });

  it('uses one representative signal for repeated snapshots of the same post', async () => {
    const repository = new InMemoryTopicCandidateRepository();
    const service = new TopicAggregationService(repository as never);

    const [candidate] = await service.aggregate({
      topicWatchId: 'topic-prediction-market',
      windowStartAt: new Date('2026-08-25T00:00:00.000Z'),
      windowEndAt: new Date('2026-08-25T03:00:00.000Z'),
      signals: [
        createSignal({
          id: 'sig_1',
          title:
            'Polymarket：JUST IN: Ugandan army chief Muhoozi Kainerugaba declares he will run for president in 2031.',
          authorHandle: 'Polymarket',
          postId: '2092502805294584138',
          observedAt: new Date('2026-08-25T01:00:00.000Z'),
          metrics: { likes: 3, reposts: 1, replies: 1, quotes: 0 },
        }),
        createSignal({
          id: 'sig_2',
          title:
            'Polymarket：JUST IN: Ugandan army chief Muhoozi Kainerugaba declares he will run for president in 2031.',
          authorHandle: 'Polymarket',
          postId: '2092502805294584138',
          observedAt: new Date('2026-08-25T02:00:00.000Z'),
          metrics: { likes: 31, reposts: 7, replies: 21, quotes: 2 },
        }),
      ],
    });

    expect(candidate.postCount).toBe(1);
    expect(candidate.representativeSignalIds).toEqual(['sig_2']);
  });

  it('groups posts with similar content from different accounts into one topic', async () => {
    const repository = new InMemoryTopicCandidateRepository();
    const service = new TopicAggregationService(repository as never);

    const candidates = await service.aggregate({
      topicWatchId: 'topic-ai-tech',
      windowStartAt: new Date('2026-08-25T00:00:00.000Z'),
      windowEndAt: new Date('2026-08-25T03:00:00.000Z'),
      signals: [
        createSignal({
          id: 'sig_1',
          title: 'TechCrunch：SpaceX was reportedly in talks to buy AI coding startup Cognition. https://t.co/a',
          summary:
            'SpaceX was reportedly in talks to buy AI coding startup Cognition.',
          authorHandle: 'TechCrunch',
          postId: 'post_1',
        }),
        createSignal({
          id: 'sig_2',
          title: 'verge：SpaceX is reportedly in talks to purchase AI coding startup Cognition. https://t.co/b',
          summary:
            'SpaceX is reportedly in talks to purchase AI coding startup Cognition.',
          authorHandle: 'verge',
          postId: 'post_2',
        }),
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].postCount).toBe(2);
    expect(candidates[0].accountCount).toBe(2);
    expect(candidates[0].representativeSignalIds).toEqual(['sig_1', 'sig_2']);
  });

  it('calculates Tmax as relative author performance and marks top 5 percent', async () => {
    const repository = new InMemoryTopicCandidateRepository();
    repository.authorSignals.set('OpenAI', [
      createSignal({
        id: 'hist_1',
        title: 'OpenAI historical post 1',
        authorHandle: 'OpenAI',
        postId: 'hist_1',
        metrics: { likes: 100, reposts: 0, replies: 0, quotes: 0 },
      }),
      createSignal({
        id: 'hist_2',
        title: 'OpenAI historical post 2',
        authorHandle: 'OpenAI',
        postId: 'hist_2',
        metrics: { likes: 80, reposts: 0, replies: 0, quotes: 0 },
      }),
      createSignal({
        id: 'hist_3',
        title: 'OpenAI historical post 3',
        authorHandle: 'OpenAI',
        postId: 'hist_3',
        metrics: { likes: 60, reposts: 0, replies: 0, quotes: 0 },
      }),
    ]);
    const service = new TopicAggregationService(repository as never);

    const [candidate] = await service.aggregate({
      topicWatchId: 'topic-ai-tech',
      windowStartAt: new Date('2026-08-25T00:00:00.000Z'),
      windowEndAt: new Date('2026-08-25T03:00:00.000Z'),
      signals: [
        createSignal({
          id: 'sig_1',
          title: 'OpenAI announces GPT-5 pricing update',
          authorHandle: 'OpenAI',
          postId: 'post_1',
          metrics: { likes: 300, reposts: 0, replies: 0, quotes: 0 },
        }),
      ],
    });

    expect(candidate.metrics.tmax).toBe(3.75);
    expect(candidate.metrics.tmaxTop5Percent).toBe(true);
  });
});

class InMemoryTopicCandidateRepository {
  readonly candidates: TopicCandidate[] = [];
  readonly authorSignals = new Map<string, Signal[]>();
  createdCount = 0;
  updatedCount = 0;

  async listRecentPostSignalsByAuthor(input: { authorHandle: string }) {
    return this.authorSignals.get(input.authorHandle) ?? [];
  }

  async upsertCandidateByClusterKey(
    input: CreateTopicCandidateInput & { clusterKey: string },
  ) {
    const existing = this.candidates.find(
      (candidate) =>
        getClusterKey(candidate) === input.clusterKey &&
        candidate.topicWatchId === input.topicWatchId,
    );

    if (existing) {
      this.updatedCount += 1;
      Object.assign(existing, {
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date('2026-08-25T04:00:00.000Z'),
      });
      return existing;
    }

    this.createdCount += 1;
    const candidate: TopicCandidate = {
      ...input,
      id: `candidate_${this.createdCount}`,
      clustering: {
        ...input.clustering,
        clusterKey: input.clusterKey,
      },
      createdAt: new Date('2026-08-25T03:00:00.000Z'),
      updatedAt: new Date('2026-08-25T03:00:00.000Z'),
    };
    this.candidates.push(candidate);
    return candidate;
  }
}

function getClusterKey(candidate: TopicCandidate) {
  return typeof candidate.clustering.clusterKey === 'string'
    ? candidate.clustering.clusterKey
    : '';
}

function createSignal(input: {
  id: string;
  title: string;
  summary?: string;
  authorHandle: string;
  postId: string;
  observedAt?: Date;
  metrics?: Signal['metrics'];
}): Signal {
  const observedAt = input.observedAt ?? new Date('2026-08-25T02:00:00.000Z');

  return {
    id: input.id,
    rawItemId: `raw_${input.id}`,
    source: 'x',
    platform: 'x',
    signalType: 'x_post',
    title: input.title,
    summary: input.summary ?? input.title,
    observedAt,
    rawRefs: [`raw_${input.id}`],
    metrics: input.metrics ?? {
      likes: 10,
      reposts: 2,
      replies: 1,
      quotes: 0,
    },
    metadata: {
      topicWatchId: 'topic-ai-tech',
      authorHandles: [input.authorHandle],
      authorHandle: input.authorHandle,
      postId: input.postId,
      url: `https://x.com/${input.authorHandle}/status/${input.postId}`,
      publishedAt: '2026-08-25T02:00:00.000Z',
    },
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

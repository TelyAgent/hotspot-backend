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
});

class InMemoryTopicCandidateRepository {
  readonly candidates: TopicCandidate[] = [];
  createdCount = 0;
  updatedCount = 0;

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
  authorHandle: string;
  postId: string;
}): Signal {
  return {
    id: input.id,
    rawItemId: `raw_${input.id}`,
    source: 'x',
    platform: 'x',
    signalType: 'x_post',
    title: input.title,
    summary: input.title,
    observedAt: new Date('2026-08-25T02:00:00.000Z'),
    rawRefs: [`raw_${input.id}`],
    metrics: {
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
    createdAt: new Date('2026-08-25T02:00:00.000Z'),
    updatedAt: new Date('2026-08-25T02:00:00.000Z'),
  };
}

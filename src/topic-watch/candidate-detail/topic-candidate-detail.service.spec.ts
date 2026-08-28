import { TopicCandidateDetailService } from './topic-candidate-detail.service';
import { TopicCandidate } from '../topic-watch.types';
import { Signal } from '../../signal/signal/signal.types';

describe('TopicCandidateDetailService', () => {
  it('resolves candidate representative signals into displayable posts', async () => {
    const repository = {
      findCandidateById: jest.fn().mockResolvedValue(createCandidate()),
      listSignalsByIds: jest.fn().mockResolvedValue([
        createSignal({
          id: 'sig_1',
          authorHandle: 'OpenAI',
          authorName: 'OpenAI',
          postId: '2090000000000000001',
          text: 'GPT-5 pricing update is live.',
          url: 'https://x.com/OpenAI/status/2090000000000000001',
        }),
      ]),
      listEvidenceBySignalIds: jest.fn().mockResolvedValue([
        {
          id: 'ev_1',
          signalId: 'sig_1',
          sourceType: 'x_account_post',
          sourceItemId: '2090000000000000001',
          text: 'GPT-5 pricing update is live.',
          url: 'https://x.com/OpenAI/status/2090000000000000001',
          author: null,
          publishedAt: new Date('2026-08-25T02:00:00.000Z'),
          metrics: {
            views: 1000,
            likes: 100,
            replies: 10,
            reposts: 20,
            quotes: 3,
          },
          metadata: {
            authorHandle: 'OpenAI',
            authorName: 'OpenAI',
            postType: 'original',
          },
        },
      ]),
    };
    const service = new TopicCandidateDetailService(repository as never);

    const posts = await service.listCandidatePosts({
      topicWatchId: 'topic-ai-tech',
      candidateId: 'candidate_1',
    });

    expect(posts).toEqual([
      {
        postId: '2090000000000000001',
        authorHandle: 'OpenAI',
        authorName: 'OpenAI',
        text: 'GPT-5 pricing update is live.',
        url: 'https://x.com/OpenAI/status/2090000000000000001',
        postType: 'original',
        publishedAt: '2026-08-25T02:00:00.000Z',
        metrics: {
          views: 1000,
          likes: 100,
          replies: 10,
          reposts: 20,
          quotes: 3,
        },
      },
    ]);
  });

  it('deduplicates repeated snapshots of the same post and keeps the latest metrics', async () => {
    const repository = {
      findCandidateById: jest.fn().mockResolvedValue({
        ...createCandidate(),
        representativeSignalIds: ['sig_1', 'sig_2'],
      }),
      listSignalsByIds: jest.fn().mockResolvedValue([
        createSignal({
          id: 'sig_1',
          authorHandle: 'Polymarket',
          authorName: 'Polymarket',
          postId: '2092502805294584138',
          text: 'JUST IN: Ugandan army chief Muhoozi Kainerugaba declares he will run for president in 2031.',
          url: 'https://x.com/Polymarket/status/2092502805294584138',
          observedAt: new Date('2026-08-26T06:42:17.571Z'),
          metrics: { views: 6300, likes: 3, replies: 1, reposts: 1 },
        }),
        createSignal({
          id: 'sig_2',
          authorHandle: 'Polymarket',
          authorName: 'Polymarket',
          postId: '2092502805294584138',
          text: 'JUST IN: Ugandan army chief Muhoozi Kainerugaba declares he will run for president in 2031.',
          url: 'https://x.com/Polymarket/status/2092502805294584138',
          observedAt: new Date('2026-08-26T08:28:15.846Z'),
          metrics: { views: 27495, likes: 93, replies: 30, reposts: 14 },
        }),
      ]),
      listEvidenceBySignalIds: jest.fn().mockResolvedValue([]),
    };
    const service = new TopicCandidateDetailService(repository as never);

    const posts = await service.listCandidatePosts({
      topicWatchId: 'topic-prediction-market',
      candidateId: 'candidate_1',
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual(
      expect.objectContaining({
        postId: '2092502805294584138',
        metrics: expect.objectContaining({
          views: 27495,
          likes: 93,
          replies: 30,
          reposts: 14,
        }),
      }),
    );
  });
});

function createCandidate(): TopicCandidate {
  return {
    id: 'candidate_1',
    topicWatchId: 'topic-ai-tech',
    title: 'GPT-5 pricing update',
    summary: 'OpenAI pricing update',
    keywords: [],
    entities: [],
    firstSeenAt: new Date('2026-08-25T02:00:00.000Z'),
    lastSeenAt: new Date('2026-08-25T02:00:00.000Z'),
    signalCount: 1,
    postCount: 1,
    accountCount: 1,
    sourceTypes: ['x_post'],
    representativeSignalIds: ['sig_1'],
    evidenceRefs: [],
    metrics: {},
    clustering: {},
    status: 'new',
    createdAt: new Date('2026-08-25T02:00:00.000Z'),
    updatedAt: new Date('2026-08-25T02:00:00.000Z'),
  };
}

function createSignal(input: {
  id: string;
  authorHandle: string;
  authorName: string;
  postId: string;
  text: string;
  url: string;
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
    title: `${input.authorHandle}：${input.text}`,
    summary: input.text,
    observedAt,
    rawRefs: [`raw_${input.id}`],
    metrics: input.metrics ?? {},
    metadata: {
      authorHandle: input.authorHandle,
      authorName: input.authorName,
      postId: input.postId,
      postType: 'original',
      publishedAt: '2026-08-25T02:00:00.000Z',
      url: input.url,
    },
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

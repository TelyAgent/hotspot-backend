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
}): Signal {
  return {
    id: input.id,
    rawItemId: `raw_${input.id}`,
    source: 'x',
    platform: 'x',
    signalType: 'x_post',
    title: `${input.authorHandle}：${input.text}`,
    summary: input.text,
    observedAt: new Date('2026-08-25T02:00:00.000Z'),
    rawRefs: [`raw_${input.id}`],
    metrics: {},
    metadata: {
      authorHandle: input.authorHandle,
      authorName: input.authorName,
      postId: input.postId,
      postType: 'original',
      publishedAt: '2026-08-25T02:00:00.000Z',
      url: input.url,
    },
    createdAt: new Date('2026-08-25T02:00:00.000Z'),
    updatedAt: new Date('2026-08-25T02:00:00.000Z'),
  };
}

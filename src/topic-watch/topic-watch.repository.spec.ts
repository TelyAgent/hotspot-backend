import { TopicWatchRepository } from './topic-watch.repository';
import { CreateTopicCandidateInput, TopicCandidate } from './topic-watch.types';

describe('TopicWatchRepository', () => {
  it('does not update a different cluster only because the title is the same', async () => {
    const existing = createCandidate({
      id: 'candidate_existing',
      clusterKey: 'content:first-topic',
      title: '预测市场相关动态',
    });
    const prisma = {
      topicCandidate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existing),
        create: jest.fn().mockResolvedValue(
          createCandidate({
            id: 'candidate_new',
            clusterKey: 'content:second-topic',
            title: '预测市场相关动态',
          }),
        ),
        update: jest.fn(),
      },
    };
    const repository = new TopicWatchRepository(prisma as never);

    await repository.upsertCandidateByClusterKey({
      ...createCandidateInput({
        clusterKey: 'content:second-topic',
        title: '预测市场相关动态',
      }),
      clusterKey: 'content:second-topic',
    });

    expect(prisma.topicCandidate.create).toHaveBeenCalledTimes(1);
    expect(prisma.topicCandidate.update).not.toHaveBeenCalled();
  });

  it('deduplicates listed candidates by display title even when cluster keys differ', async () => {
    const prisma = {
      topicCandidate: {
        findMany: jest.fn().mockResolvedValue([
          createCandidate({
            id: 'candidate_newer',
            clusterKey: 'content:first-topic',
            title: '预测市场相关动态',
          }),
          createCandidate({
            id: 'candidate_older',
            clusterKey: 'content:second-topic',
            title: '预测市场相关动态',
          }),
        ]),
      },
    };
    const repository = new TopicWatchRepository(prisma as never);

    const candidates = await repository.listCandidates('topic-prediction-market');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('candidate_newer');
  });
});

function createCandidateInput(input: {
  clusterKey: string;
  title: string;
}): CreateTopicCandidateInput {
  return {
    topicWatchId: 'topic-prediction-market',
    title: input.title,
    summary: 'Polymarket 正在讨论预测市场相关动态。',
    keywords: [],
    entities: [],
    firstSeenAt: new Date('2026-08-25T01:00:00.000Z'),
    lastSeenAt: new Date('2026-08-25T02:00:00.000Z'),
    signalCount: 1,
    postCount: 1,
    accountCount: 1,
    sourceTypes: ['x_post'],
    representativeSignalIds: ['sig_1'],
    evidenceRefs: [],
    metrics: {},
    clustering: {
      method: 'hybrid',
      clusterKey: input.clusterKey,
      confidence: 'low',
    },
    status: 'new',
  };
}

function createCandidate(input: {
  id: string;
  clusterKey: string;
  title: string;
}): TopicCandidate {
  return {
    ...createCandidateInput(input),
    id: input.id,
    createdAt: new Date('2026-08-25T01:00:00.000Z'),
    updatedAt: new Date('2026-08-25T02:00:00.000Z'),
  };
}

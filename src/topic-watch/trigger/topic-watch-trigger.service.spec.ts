import { OpportunityRepository } from '../../opportunity/opportunity.repository';
import { TopicCandidate, TopicWatch } from '../topic-watch.types';
import { TopicWatchRepository } from '../topic-watch.repository';
import { TopicWatchTriggerService } from './topic-watch-trigger.service';

describe('TopicWatchTriggerService', () => {
  it('creates an event when a candidate matches TC-01 B3h rule', async () => {
    const topicWatch = createTopicWatch();
    const candidate = createCandidate({
      metrics: {
        b3h: 3,
        b24h: 3,
        tmax: 1,
        tmaxTop5Percent: null,
      },
    });
    const topicWatchRepository = {
      listEvidenceBySignalIds: jest.fn(() => [
        {
          id: 'ev_1',
          signalId: 'sig_1',
        },
        {
          id: 'ev_2',
          signalId: 'sig_2',
        },
      ]),
      createDecision: jest.fn((input) => ({
        id: 'decision_1',
        createdAt: new Date('2026-08-26T00:00:00.000Z'),
        ...input,
      })),
      updateCandidateStatus: jest.fn((input) => ({
        ...candidate,
        status: input.status,
      })),
    } as unknown as TopicWatchRepository;
    const opportunityRepository = {
      createEvent: jest.fn((input) => ({
        id: 'event_1',
        createdAt: new Date('2026-08-26T00:00:00.000Z'),
        updatedAt: new Date('2026-08-26T00:00:00.000Z'),
        ...input,
      })),
    } as unknown as OpportunityRepository;
    const service = new TopicWatchTriggerService(
      topicWatchRepository,
      opportunityRepository,
    );

    const result = await service.evaluateAndTrigger({
      topicWatch,
      candidates: [candidate],
    });

    expect(result.triggeredCount).toBe(1);
    expect(opportunityRepository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: candidate.title,
        eventType: 'industry_topic',
        evidenceRefs: ['ev_1', 'ev_2'],
        confidence: 'high',
        status: 'suggested',
      }),
    );
    expect(topicWatchRepository.createDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        topicWatchId: topicWatch.id,
        decision: 'create_event',
        matchedRules: ['TC-01'],
      }),
    );
    expect(
      (topicWatchRepository as unknown as { updateCandidateStatus: jest.Mock })
        .updateCandidateStatus,
    ).toHaveBeenCalledWith({
      candidateId: candidate.id,
      status: 'converted_to_event',
    });
  });
});

function createTopicWatch(): TopicWatch {
  return {
    id: 'topic-ai-tech',
    name: 'AI 与科技',
    description: '',
    domains: [],
    watchIntent: '',
    collectionPolicy: '',
    triggerPolicy: '',
    evidencePolicy: '',
    exclusionPolicy: null,
    status: 'active',
    ownerId: null,
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
  };
}

function createCandidate(input: { metrics: TopicCandidate['metrics'] }): TopicCandidate {
  return {
    id: 'candidate_1',
    topicWatchId: 'topic-ai-tech',
    title: 'OpenAI 发布新的模型能力',
    summary: '多个账号正在讨论 OpenAI 新模型能力。',
    keywords: [],
    entities: [],
    firstSeenAt: new Date('2026-08-26T00:00:00.000Z'),
    lastSeenAt: new Date('2026-08-26T01:00:00.000Z'),
    signalCount: 3,
    postCount: 3,
    accountCount: 3,
    sourceTypes: ['x_post'],
    representativeSignalIds: ['sig_1', 'sig_2', 'sig_3'],
    evidenceRefs: [],
    metrics: input.metrics,
    clustering: {},
    status: 'new',
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    updatedAt: new Date('2026-08-26T01:00:00.000Z'),
  };
}

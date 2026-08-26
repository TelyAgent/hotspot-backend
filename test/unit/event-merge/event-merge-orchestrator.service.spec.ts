import { EventMergeAgentService } from '../../../src/event-merge/event-merge-agent.service';
import { EventMergeOrchestratorService } from '../../../src/event-merge/event-merge-orchestrator.service';
import { EventMergeRepository } from '../../../src/event-merge/event-merge.repository';
import { EventSourceContext } from '../../../src/event-merge/event-merge.types';

describe('EventMergeOrchestratorService', () => {
  const makeIncomingContext = (
    overrides: Partial<EventSourceContext> = {},
  ): EventSourceContext => ({
    id: 'ctx_incoming',
    mainEventId: 'event_incoming',
    sourceEventId: 'sig_topic_1',
    sourceType: 'topic_circle',
    triggerType: 'single_post_breakout',
    triggerRuleCode: 'TC-03',
    ruleVersion: 'v1',
    contextVersion: 1,
    title: 'OpenAI 发布 GPT-6 API',
    summary: '主题圈讨论 OpenAI 发布 GPT-6 API。',
    identity: {
      subject: 'OpenAI',
      action: '发布',
      object: 'GPT-6 API',
      time: {},
      state: 'confirmed',
      coreFact: 'OpenAI 发布 GPT-6 API。',
    },
    evidenceRefs: ['ev_topic_1'],
    signalRefs: ['sig_topic_1'],
    payload: {},
    triggeredAt: new Date('2026-08-26T10:00:00.000Z'),
    createdAt: new Date('2026-08-26T10:00:00.000Z'),
    updatedAt: new Date('2026-08-26T10:00:00.000Z'),
    ...overrides,
  });

  const candidateEvent = {
    id: 'event_main',
    title: 'OpenAI 发布 GPT-6 API',
    eventType: 'news_event',
    summary: 'OpenAI 发布 GPT-6 API。',
    evidenceRefs: ['ev_x_1'],
    missingData: [],
    riskNotes: [],
    labels: [],
    confidence: 'high',
    status: 'suggested',
    createdAt: new Date('2026-08-26T09:00:00.000Z'),
    updatedAt: new Date('2026-08-26T09:00:00.000Z'),
  };

  it('auto merges an incoming source context into an existing main event when identity confidence is high', async () => {
    const incomingContext = makeIncomingContext();
    const repository = {
      findCandidateMainEvents: jest.fn(() => Promise.resolve([candidateEvent])),
      listSourceContexts: jest.fn(() => Promise.resolve([])),
      createMergeDecision: jest.fn(() =>
        Promise.resolve({
          id: 'decision_1',
          incomingContextId: 'ctx_incoming',
          candidateMainEventId: 'event_main',
          decision: 'auto_merge',
          mergeConfidence: 0.97,
          hardConflict: false,
          dimensionResults: [],
          conflictPoints: [],
          evidenceRefs: ['ev_topic_1'],
          impact: {
            responseAction: 'update_context_only',
            reason: '同一现实事件，合并来源上下文。',
          },
          decidedBy: 'agent',
          decidedAt: new Date('2026-08-26T10:01:00.000Z'),
          createdAt: new Date('2026-08-26T10:01:00.000Z'),
        }),
      ),
      attachSourceContextToMainEvent: jest.fn(() => Promise.resolve({})),
      markEventMergedIntoCanonical: jest.fn(() => Promise.resolve({})),
      createEventRelation: jest.fn(),
    } as unknown as EventMergeRepository;
    const agent = {
      compare: jest.fn(() =>
        Promise.resolve({
          decision: {
            decision: 'auto_merge',
            mergeConfidence: 0.97,
            hardConflict: false,
            dimensionResults: [
              {
                dimension: 'subject',
                label: '主体',
                score: 1,
                result: 'compatible',
                comparison: '同一公司或机构',
                evidenceRefs: ['ev_topic_1', 'ev_x_1'],
              },
            ],
            conflictPoints: [],
            evidenceRefs: ['ev_topic_1', 'ev_x_1'],
            impact: {
              responseAction: 'update_context_only',
              reason: '同一现实事件，合并来源上下文。',
            },
          },
          agentRunId: 'agent_run_1',
        }),
      ),
    } as unknown as EventMergeAgentService;
    const service = new EventMergeOrchestratorService(repository, agent);

    const result = await service.processIncomingContext(incomingContext);

    expect(result.action).toBe('auto_merged');
    expect(repository.findCandidateMainEvents).toHaveBeenCalledWith(
      incomingContext,
      expect.objectContaining({ take: 5 }),
    );
    expect(agent.compare).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingContext,
        candidateEvent,
      }),
    );
    expect(repository.createMergeDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        incomingContextId: 'ctx_incoming',
        candidateMainEventId: 'event_main',
        decision: 'auto_merge',
        mergeConfidence: 0.97,
        hardConflict: false,
        evidenceRefs: ['ev_topic_1', 'ev_x_1'],
        agentRunId: 'agent_run_1',
        decidedBy: 'agent',
      }),
    );
    expect(repository.attachSourceContextToMainEvent).toHaveBeenCalledWith({
      contextId: 'ctx_incoming',
      mainEventId: 'event_main',
    });
    expect(repository.markEventMergedIntoCanonical).toHaveBeenCalledWith({
      eventId: 'event_incoming',
      canonicalEventId: 'event_main',
    });
    expect(repository.createEventRelation).not.toHaveBeenCalled();
  });

  it('keeps events independent when merge confidence is below auto merge threshold', async () => {
    const incomingContext = makeIncomingContext();
    const repository = {
      findCandidateMainEvents: jest.fn(() => Promise.resolve([candidateEvent])),
      listSourceContexts: jest.fn(() => Promise.resolve([])),
      createMergeDecision: jest.fn(() =>
        Promise.resolve({
          id: 'decision_keep_independent',
          incomingContextId: 'ctx_incoming',
          candidateMainEventId: 'event_main',
          decision: 'keep_independent',
          mergeConfidence: 0.87,
          hardConflict: false,
          dimensionResults: [],
          conflictPoints: [],
          evidenceRefs: ['ev_topic_1', 'ev_x_1'],
          impact: {
            responseAction: 'route_independently',
            reason: '相似但置信度不足，保持独立。',
          },
          decidedBy: 'agent',
          decidedAt: new Date('2026-08-26T10:01:00.000Z'),
          createdAt: new Date('2026-08-26T10:01:00.000Z'),
        }),
      ),
      attachSourceContextToMainEvent: jest.fn(),
      markEventMergedIntoCanonical: jest.fn(),
      createEventRelation: jest.fn(),
    } as unknown as EventMergeRepository;
    const agent = {
      compare: jest.fn(() =>
        Promise.resolve({
          decision: {
            decision: 'keep_independent',
            mergeConfidence: 0.87,
            hardConflict: false,
            dimensionResults: [],
            conflictPoints: [],
            evidenceRefs: ['ev_topic_1', 'ev_x_1'],
            impact: {
              responseAction: 'route_independently',
              reason: '相似但置信度不足，保持独立。',
            },
          },
          agentRunId: 'agent_run_keep_independent',
        }),
      ),
    } as unknown as EventMergeAgentService;
    const service = new EventMergeOrchestratorService(repository, agent);

    const result = await service.processIncomingContext(incomingContext);

    expect(result.action).toBe('kept_independent');
    expect(repository.attachSourceContextToMainEvent).not.toHaveBeenCalled();
  });

  it('creates an event relation when the merge agent suggests a related event', async () => {
    const incomingContext = makeIncomingContext();
    const repository = {
      findCandidateMainEvents: jest.fn(() => Promise.resolve([candidateEvent])),
      listSourceContexts: jest.fn(() => Promise.resolve([])),
      createMergeDecision: jest.fn(() =>
        Promise.resolve({
          id: 'decision_relation',
          incomingContextId: 'ctx_incoming',
          candidateMainEventId: 'event_main',
          decision: 'create_related_event',
          mergeConfidence: 0.76,
          hardConflict: false,
          dimensionResults: [],
          conflictPoints: [],
          evidenceRefs: ['ev_topic_1', 'ev_x_1'],
          impact: {
            responseAction: 'route_independently',
            reason: '不是同一事件，但可能是后续进展。',
          },
          decidedBy: 'agent',
          decidedAt: new Date('2026-08-26T10:01:00.000Z'),
          createdAt: new Date('2026-08-26T10:01:00.000Z'),
        }),
      ),
      attachSourceContextToMainEvent: jest.fn(),
      markEventMergedIntoCanonical: jest.fn(),
      createEventRelation: jest.fn(() => Promise.resolve({})),
    } as unknown as EventMergeRepository;
    const agent = {
      compare: jest.fn(() =>
        Promise.resolve({
          decision: {
            decision: 'create_related_event',
            mergeConfidence: 0.76,
            hardConflict: false,
            dimensionResults: [],
            conflictPoints: [],
            relationSuggestion: {
              relationType: 'follow_up',
              reason: '更像同一主体的后续进展。',
            },
            evidenceRefs: ['ev_topic_1', 'ev_x_1'],
            impact: {
              responseAction: 'route_independently',
              reason: '不是同一事件，但可能是后续进展。',
            },
          },
          agentRunId: 'agent_run_relation',
        }),
      ),
    } as unknown as EventMergeAgentService;
    const service = new EventMergeOrchestratorService(repository, agent);

    const result = await service.processIncomingContext(incomingContext);

    expect(result.action).toBe('related_event');
    expect(repository.createEventRelation).toHaveBeenCalledWith({
      fromEventId: 'event_main',
      toEventId: 'event_incoming',
      relationType: 'follow_up',
      reason: '更像同一主体的后续进展。',
      evidenceRefs: ['ev_topic_1', 'ev_x_1'],
      createdBy: 'agent',
    });
  });
});

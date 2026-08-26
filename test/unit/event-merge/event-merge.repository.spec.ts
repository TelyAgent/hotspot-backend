import { EventMergeRepository } from '../../../src/event-merge/event-merge.repository';

describe('EventMergeRepository', () => {
  it('creates and lists source contexts for a main event', async () => {
    const sourceContext = {
      id: 'ctx_1',
      mainEventId: 'event_1',
      sourceType: 'x_trend',
      triggerType: 'top_5',
      title: 'OpenAI 发布 API',
    };
    const prisma = {
      eventSourceContext: {
        create: jest.fn(() => Promise.resolve(sourceContext)),
        findMany: jest.fn(() => Promise.resolve([sourceContext])),
      },
    };
    const repository = new EventMergeRepository(prisma as never);

    const created = await repository.createSourceContext({
      mainEventId: 'event_1',
      sourceType: 'x_trend',
      triggerType: 'top_5',
      triggerRuleCode: 'TR-01',
      ruleVersion: 'v1',
      title: 'OpenAI 发布 API',
      summary: 'OpenAI 官方宣布 API。',
      identity: {
        subject: 'OpenAI',
        action: '正式发布',
        object: 'API',
        time: {},
        state: 'confirmed',
        coreFact: 'OpenAI 正式发布 API。',
      },
      evidenceRefs: ['ev_1'],
      signalRefs: ['sig_1'],
      payload: { source: 'x' },
      triggeredAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    const rows = await repository.listSourceContexts('event_1');

    expect(created).toBe(sourceContext);
    expect(rows).toEqual([sourceContext]);
    expect(prisma.eventSourceContext.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mainEventId: 'event_1',
        sourceType: 'x_trend',
        triggerType: 'top_5',
        triggerRuleCode: 'TR-01',
        ruleVersion: 'v1',
        title: 'OpenAI 发布 API',
        evidenceRefs: ['ev_1'],
        signalRefs: ['sig_1'],
      }),
    });
    expect(prisma.eventSourceContext.findMany).toHaveBeenCalledWith({
      where: { mainEventId: 'event_1' },
      orderBy: { triggeredAt: 'asc' },
    });
  });

  it('creates and returns the latest merge decision for a main event', async () => {
    const decision = {
      id: 'decision_1',
      candidateMainEventId: 'event_1',
      mergeConfidence: 0.97,
      decision: 'auto_merge',
    };
    const prisma = {
      eventMergeDecision: {
        create: jest.fn(() => Promise.resolve(decision)),
        findFirst: jest.fn(() => Promise.resolve(decision)),
      },
    };
    const repository = new EventMergeRepository(prisma as never);

    await repository.createMergeDecision({
      incomingContextId: 'ctx_1',
      candidateMainEventId: 'event_1',
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
          evidenceRefs: ['ev_1'],
        },
      ],
      conflictPoints: [],
      evidenceRefs: ['ev_1'],
      impact: {
        responseAction: 'route_once',
        reason: '自动合并后由主 Event 路由一次。',
      },
      agentRunId: 'run_1',
      decidedBy: 'agent',
    });
    const latest = await repository.getLatestMergeDecision('event_1');

    expect(latest).toBe(decision);
    expect(prisma.eventMergeDecision.findFirst).toHaveBeenCalledWith({
      where: { candidateMainEventId: 'event_1' },
      orderBy: { decidedAt: 'desc' },
    });
  });

  it('upserts an event relation for related event suggestions', async () => {
    const relation = {
      id: 'relation_1',
      fromEventId: 'event_main',
      toEventId: 'event_incoming',
      relationType: 'follow_up',
    };
    const prisma = {
      eventRelation: {
        upsert: jest.fn(() => Promise.resolve(relation)),
      },
    };
    const repository = new EventMergeRepository(prisma as never);

    const created = await repository.createEventRelation({
      fromEventId: 'event_main',
      toEventId: 'event_incoming',
      relationType: 'follow_up',
      reason: '更像同一主体的后续进展。',
      evidenceRefs: ['ev_1', 'ev_2'],
      createdBy: 'agent',
    });

    expect(created).toBe(relation);
    expect(prisma.eventRelation.upsert).toHaveBeenCalledWith({
      where: {
        fromEventId_toEventId_relationType: {
          fromEventId: 'event_main',
          toEventId: 'event_incoming',
          relationType: 'follow_up',
        },
      },
      create: expect.objectContaining({
        fromEventId: 'event_main',
        toEventId: 'event_incoming',
        relationType: 'follow_up',
        reason: '更像同一主体的后续进展。',
        evidenceRefs: ['ev_1', 'ev_2'],
        createdBy: 'agent',
      }),
      update: expect.objectContaining({
        reason: '更像同一主体的后续进展。',
        evidenceRefs: ['ev_1', 'ev_2'],
        createdBy: 'agent',
      }),
    });
  });
});

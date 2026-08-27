import { EventTriggerReasonService } from '../../../src/opportunity/trigger-reason/event-trigger-reason.service';
import { Event, EventLabel } from '../../../src/opportunity/opportunity.types';
import { EvidenceItem } from '../../../src/signal/evidence/evidence.types';

describe('EventTriggerReasonService', () => {
  it('uses topic circle rule metrics instead of first-party label reason', async () => {
    const service = createService({
      topicCandidate: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'candidate_1',
            metrics: {
              b3h: 4,
              b24h: 4,
              tmax: 1.2,
              tmaxTop5Percent: false,
            },
          }),
        ),
      },
    });

    const reasons = await service.buildTriggerReasons({
      event: createEvent({
        labels: [
          createLabel({
            code: 'Topic Circle',
            category: 'source',
            reason: '事件包含 Topic Circle 的真实证据。',
          }),
          createLabel({
            code: '第一方确认',
            category: 'trigger',
            reason: '@Polymarket 是 S1 第一方权威账号。',
          }),
        ],
      }),
      evidence: [
        createEvidence({
          id: 'ev_topic',
          sourceType: 'x_account_post',
          signalId: 'sig_topic',
          metadata: {
            topicWatchId: 'topic-prediction-market',
          },
        }),
      ],
    });

    expect(reasons).toEqual([
      {
        code: 'TC-01',
        text: 'TC-01：最近 3 小时内出现集中讨论，B3h = 4，达到 B3h >= 3。',
        evidenceRefs: ['ev_topic'],
        sourcePath: 'topic_circle',
      },
    ]);
  });

  it('builds x trend trigger reasons from ranking evidence', async () => {
    const service = createService();

    const reasons = await service.buildTriggerReasons({
      event: createEvent(),
      evidence: [
        createEvidence({
          id: 'ev_rank',
          sourceType: 'x_trend',
          metadata: {
            rank: 4,
            region: 'United States',
          },
        }),
        createEvidence({
          id: 'ev_jp',
          sourceType: 'x_trend',
          metadata: {
            rank: 18,
            region: 'Japan',
          },
        }),
      ],
    });

    expect(reasons).toEqual(
      expect.arrayContaining([
        {
          code: 'TR-01',
          text: 'TR-01：首次进入输入榜单前 10，United States 当前排名第 4。',
          evidenceRefs: ['ev_rank'],
          sourcePath: 'x_trend',
        },
        {
          code: 'TR-04',
          text: 'TR-04：同一事件同时出现在 2 个输入地区榜单：United States、Japan。',
          evidenceRefs: ['ev_rank', 'ev_jp'],
          sourcePath: 'x_trend',
        },
      ]),
    );
  });
});

function createService(prisma: Record<string, unknown> = {}) {
  return new EventTriggerReasonService(prisma as never);
}

function createEvent(input: Partial<Event> = {}): Event {
  return {
    id: input.id ?? 'event_1',
    title: input.title ?? '测试事件',
    eventType: input.eventType ?? 'industry_topic',
    summary: input.summary ?? '测试摘要',
    evidenceRefs: input.evidenceRefs ?? ['ev_topic'],
    missingData: input.missingData ?? [],
    riskNotes: input.riskNotes ?? [],
    labels: input.labels ?? [],
    confidence: input.confidence ?? 'high',
    status: input.status ?? 'suggested',
    createdAt: input.createdAt ?? new Date('2026-08-27T00:00:00Z'),
    updatedAt: input.updatedAt ?? new Date('2026-08-27T00:00:00Z'),
  };
}

function createLabel(input: Partial<EventLabel>): EventLabel {
  return {
    code: input.code ?? 'Topic Circle',
    name: input.name ?? input.code ?? 'Topic Circle',
    category: input.category ?? 'source',
    sourcePath: input.sourcePath ?? 'topic_circle',
    evidenceRefs: input.evidenceRefs ?? ['ev_topic'],
    reason: input.reason ?? '标签原因',
    confidence: input.confidence ?? 'high',
  };
}

function createEvidence(input: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: input.id ?? 'ev_topic',
    signalId: input.signalId ?? null,
    sourceTool: input.sourceTool ?? null,
    sourceType: input.sourceType ?? 'x_account_post',
    sourceItemId: input.sourceItemId ?? null,
    claim: input.claim ?? '测试证据',
    text: input.text ?? null,
    url: input.url ?? null,
    author: input.author ?? null,
    publishedAt: input.publishedAt ?? null,
    observedAt: input.observedAt ?? new Date('2026-08-27T00:00:00Z'),
    metrics: input.metrics ?? null,
    confidence: input.confidence ?? 'high',
    rawRef: input.rawRef ?? null,
    metadata: input.metadata ?? null,
    createdAt: input.createdAt ?? new Date('2026-08-27T00:00:00Z'),
    updatedAt: input.updatedAt ?? new Date('2026-08-27T00:00:00Z'),
  };
}

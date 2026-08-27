import { EventLabelingService } from './event-labeling.service';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { PrismaService } from '../../database/prisma.service';
import { EventDomainLabelService } from './event-domain-label.service';

describe('EventLabelingService', () => {
  it('labels x trend source and top 5 only when rank is within top 5', async () => {
    const service = createService();

    const labels = await service.buildLabels({
      evidence: [
        createEvidence({
          id: 'ev_top',
          sourceType: 'x_trend',
          metadata: {
            rank: 3,
            region: 'Japan',
          },
        }),
        createEvidence({
          id: 'ev_normal',
          sourceType: 'x_trend',
          metadata: {
            rank: 18,
            region: 'Korea',
          },
        }),
      ],
    });

    expect(labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'X Trend',
          name: 'X Trend',
          category: 'source',
          evidenceRefs: ['ev_top', 'ev_normal'],
        }),
        expect.objectContaining({
          code: 'Top5',
          name: 'Top5',
          category: 'trigger',
          evidenceRefs: ['ev_top'],
        }),
      ]),
    );
    expect(labels.some((label) => label.code === 'Fast Rising')).toBe(false);
  });

  it('labels fast rising only when rank movement evidence exists', async () => {
    const service = createService();

    const labels = await service.buildLabels({
      evidence: [
        createEvidence({
          id: 'ev_rising',
          sourceType: 'x_trend',
          metadata: {
            rank: 8,
            previousRank: 24,
            region: 'United States',
          },
        }),
      ],
    });

    expect(labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'Fast Rising',
          name: 'Fast Rising',
          category: 'trigger',
          evidenceRefs: ['ev_rising'],
        }),
      ]),
    );
  });

  it('labels fast rising from x trend snapshot diffs when evidence does not include previous rank', async () => {
    const service = createService(
      createPrisma({
        xTrendSnapshotDiff: {
          findFirst: jest.fn(() =>
            Promise.resolve({
              id: 'diff_1',
              previousRank: 30,
              currentRank: 11,
              rankDelta: 19,
              diffType: 'up',
            }),
          ),
        },
      }),
    );

    const labels = await service.buildLabels({
      evidence: [
        createEvidence({
          id: 'ev_diff',
          sourceType: 'x_trend',
          text: 'コミコン',
          metadata: {
            rank: 11,
            region: 'Japan',
          },
        }),
      ],
    });

    expect(labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'Fast Rising',
          name: 'Fast Rising',
          category: 'trigger',
          evidenceRefs: ['ev_diff'],
        }),
      ]),
    );
  });

  it('labels first party confirmation from S1 topic watch account evidence', async () => {
    const service = createService(
      createPrisma({
        topicWatchAccount: {
          findFirst: jest.fn(() =>
            Promise.resolve({
              handle: 'OpenAI',
              primaryRole: '第一方权威账号',
              singleTriggerPolicy: 'S1',
              authorityScope: 'OpenAI 公司、模型和产品',
            }),
          ),
        },
      }),
    );

    const labels = await service.buildLabels({
      evidence: [
        createEvidence({
          id: 'ev_openai',
          sourceType: 'x_account_post',
          metadata: {
            topicWatchId: 'topic-ai-tech',
            authorHandle: 'OpenAI',
          },
        }),
      ],
    });

    expect(labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'Topic Circle',
          name: 'Topic Circle',
          category: 'source',
          evidenceRefs: ['ev_openai'],
        }),
        expect.objectContaining({
          code: '第一方确认',
          name: '第一方确认',
          category: 'trigger',
          evidenceRefs: ['ev_openai'],
          sourcePath: 'topic_circle',
        }),
      ]),
    );
  });

  it('only emits fixed source and heat labels outside domain labels', async () => {
    const service = createService(
      createPrisma({
        topicWatchAccount: {
          findFirst: jest.fn(() =>
            Promise.resolve({
              handle: 'VitalikButerin',
              primaryRole: '核心人物',
              singleTriggerPolicy: 'S2',
              authorityScope: '以太坊生态',
            }),
          ),
        },
      }),
    );

    const labels = await service.buildLabels({
      evidence: [
        createEvidence({
          id: 'ev_x',
          sourceType: 'x_trend',
          metadata: {
            rank: 4,
            previousRank: 20,
            region: 'United States',
          },
        }),
        createEvidence({
          id: 'ev_topic',
          sourceType: 'x_account_post',
          metadata: {
            topicWatchId: 'topic-crypto',
            authorHandle: 'VitalikButerin',
          },
        }),
        createEvidence({
          id: 'ev_future',
          sourceType: 'future_event_source_item',
        }),
      ],
    });

    const fixed = new Set([
      'X Trend',
      'Topic Circle',
      'Future Event',
      'Top5',
      'Fast Rising',
      'Multi-region',
      '第一方确认',
      'Re-entry',
    ]);
    expect(labels.filter((label) => label.category !== 'domain')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'X Trend' }),
        expect.objectContaining({ code: 'Topic Circle' }),
        expect.objectContaining({ code: 'Future Event' }),
        expect.objectContaining({ code: 'Top5' }),
        expect.objectContaining({ code: 'Fast Rising' }),
      ]),
    );
    expect(
      labels
        .filter((label) => label.category !== 'domain')
        .every((label) => fixed.has(label.code)),
    ).toBe(true);
  });

  it('adds fixed domain labels from evidence text', async () => {
    const service = createService();

    const labels = await service.buildLabels({
      evidence: [
        createEvidence({
          id: 'ev_prediction',
          sourceType: 'x_account_post',
          claim: 'Polymarket 预测市场概率出现明显变化。',
          text: 'Polymarket odds moved sharply after the debate.',
        }),
      ],
    });

    expect(labels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'Prediction Markets',
          name: 'Prediction Markets',
          category: 'domain',
          evidenceRefs: ['ev_prediction'],
        }),
      ]),
    );
  });
});

function createService(prisma = createPrisma()) {
  return new EventLabelingService(prisma, new EventDomainLabelService());
}

function createEvidence(input: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: input.id ?? 'ev_1',
    signalId: input.signalId ?? 'sig_1',
    sourceTool: null,
    sourceType: input.sourceType ?? 'x_trend',
    sourceItemId: null,
    claim: input.claim ?? 'claim',
    text: input.text ?? null,
    url: input.url ?? null,
    author: input.author ?? null,
    publishedAt: input.publishedAt ?? null,
    observedAt: input.observedAt ?? new Date('2026-08-26T00:00:00.000Z'),
    metrics: input.metrics ?? null,
    confidence: input.confidence ?? 'high',
    rawRef: null,
    metadata: input.metadata ?? null,
    createdAt: input.createdAt ?? new Date('2026-08-26T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-08-26T00:00:00.000Z'),
  };
}

function createPrisma(overrides: Record<string, unknown> = {}): PrismaService {
  return {
    topicWatchAccount: {
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    xTrendSnapshotDiff: {
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    ...overrides,
  } as unknown as PrismaService;
}

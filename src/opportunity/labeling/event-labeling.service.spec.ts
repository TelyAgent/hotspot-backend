import { EventLabelingService } from './event-labeling.service';
import { EvidenceItem } from '../../signal/evidence/evidence.types';
import { PrismaService } from '../../database/prisma.service';

describe('EventLabelingService', () => {
  it('labels x trend source and top 5 only when rank is within top 5', async () => {
    const service = new EventLabelingService(createPrisma());

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
          code: 'x_trend',
          name: 'X 热搜',
          category: 'source',
          evidenceRefs: ['ev_top', 'ev_normal'],
        }),
        expect.objectContaining({
          code: 'x_trend_top_5',
          name: 'Top 5',
          category: 'trigger',
          evidenceRefs: ['ev_top'],
        }),
      ]),
    );
    expect(labels.some((label) => label.code === 'x_trend_fast_rising')).toBe(false);
  });

  it('labels fast rising only when rank movement evidence exists', async () => {
    const service = new EventLabelingService(createPrisma());

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
          code: 'x_trend_fast_rising',
          name: 'Fast Rising',
          category: 'trigger',
          evidenceRefs: ['ev_rising'],
        }),
      ]),
    );
  });

  it('labels fast rising from x trend snapshot diffs when evidence does not include previous rank', async () => {
    const service = new EventLabelingService(
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
          code: 'x_trend_fast_rising',
          name: 'Fast Rising',
          category: 'trigger',
          evidenceRefs: ['ev_diff'],
        }),
      ]),
    );
  });

  it('labels first party confirmation from S1 topic watch account evidence', async () => {
    const service = new EventLabelingService(
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
          code: 'topic_circle',
          name: '关注圈层',
          category: 'source',
          evidenceRefs: ['ev_openai'],
        }),
        expect.objectContaining({
          code: 'first_party_confirmed',
          name: '第一方确认',
          category: 'trigger',
          evidenceRefs: ['ev_openai'],
          sourcePath: 'topic_circle',
        }),
      ]),
    );
  });
});

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

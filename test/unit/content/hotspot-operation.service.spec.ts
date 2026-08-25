import { DomainError } from '../../../src/common/errors/domain-error';
import { ContentGenerationAgentService } from '../../../src/content/generation/content-generation-agent.service';
import { HotspotOperationService } from '../../../src/content/hotspot-operation/hotspot-operation.service';
import { PrismaService } from '../../../src/database/prisma.service';

describe('HotspotOperationService', () => {
  it('generates three post drafts from an event and its evidence', async () => {
    const prisma = {
      event: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'event_1',
            title: 'AI 发布新模型',
            summary: 'OpenAI 发布新模型。',
            eventType: 'news_event',
            evidenceRefs: ['evi_1'],
            missingData: [],
            riskNotes: [],
            confidence: 'high',
            status: 'suggested',
            createdAt: new Date('2026-08-25T00:00:00.000Z'),
            updatedAt: new Date('2026-08-25T00:00:00.000Z'),
          }),
        ),
      },
      evidenceItem: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'evi_1',
              sourceType: 'x_trend',
              claim: 'AI 发布新模型进入热搜。',
              text: 'AI 发布新模型',
              url: 'https://x.com/search?q=ai',
              confidence: 'medium',
              observedAt: new Date('2026-08-25T00:00:00.000Z'),
            },
          ]),
        ),
      },
      contentDraft: {
        findMany: jest.fn(),
      },
      publishedPost: {
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const generator = {
      generate: jest.fn((input) =>
        Promise.resolve({
          id: `draft_${input.contentTask.angle}`,
          contentTaskId: input.contentTask.id,
          version: 1,
          body: `候选内容 ${input.contentTask.angle}`,
          evidenceRefs: ['evi_1'],
          generationInput: {},
          userInstruction: null,
          status: 'draft',
          createdAt: new Date('2026-08-25T00:00:00.000Z'),
          updatedAt: new Date('2026-08-25T00:00:00.000Z'),
        }),
      ),
    } as unknown as ContentGenerationAgentService;
    const service = new HotspotOperationService(prisma, generator);

    const result = await service.generatePosts({
      eventId: 'event_1',
      userInstruction: '语气更犀利一点',
    });

    expect(result.eventId).toBe('event_1');
    expect(result.contentTaskId).toBe('hotspot_operation:event_1');
    expect(result.drafts).toHaveLength(3);
    expect(generator.generate).toHaveBeenCalledTimes(3);
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentTask: expect.objectContaining({
          id: 'hotspot_operation:event_1',
          targetType: 'event',
          targetId: 'event_1',
          evidenceRefs: ['evi_1'],
        }),
        userInstruction: expect.stringContaining('语气更犀利一点'),
      }),
    );
  });

  it('throws a clear error when the event has no resolvable evidence', async () => {
    const prisma = {
      event: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'event_1',
            title: 'AI 发布新模型',
            summary: 'OpenAI 发布新模型。',
            eventType: 'news_event',
            evidenceRefs: ['missing_evi'],
          }),
        ),
      },
      evidenceItem: {
        findMany: jest.fn(() => Promise.resolve([])),
      },
    } as unknown as PrismaService;
    const generator = {
      generate: jest.fn(),
    } as unknown as ContentGenerationAgentService;
    const service = new HotspotOperationService(prisma, generator);

    await expect(service.generatePosts({ eventId: 'event_1' })).rejects.toThrow(
      expect.objectContaining({
        code: 'HOTSPOT_OPERATION_EVIDENCE_REQUIRED',
      }) as DomainError,
    );
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('stores the publishing account when backfilling a post url', async () => {
    const prisma = {
      contentDraft: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: 'draft_1',
            contentTaskId: 'hotspot_operation:event_1',
          }),
        ),
      },
      publishedPost: {
        create: jest.fn((input) => Promise.resolve({ id: 'post_1', ...input.data })),
      },
    } as unknown as PrismaService;
    const generator = {
      generate: jest.fn(),
    } as unknown as ContentGenerationAgentService;
    const service = new HotspotOperationService(prisma, generator);

    await service.publish({
      eventId: 'event_1',
      draftId: 'draft_1',
      url: 'https://x.com/predx/status/1',
      accountName: '@PredX',
    });

    expect(prisma.publishedPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'predx',
          accountName: '@PredX',
        }),
      }),
    );
  });
});

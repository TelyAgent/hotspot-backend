import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { JsonObject } from '../../common/types/json.type';
import { PrismaService } from '../../database/prisma.service';
import { ContentDraft, ContentTask } from '../content.types';
import { ContentGenerationAgentService } from '../generation/content-generation-agent.service';

export interface HotspotOperationDraftResult {
  eventId: string;
  contentTaskId: string;
  drafts: ContentDraft[];
}

@Injectable()
export class HotspotOperationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentGenerationAgent: ContentGenerationAgentService,
  ) {}

  async listDrafts(eventId: string): Promise<HotspotOperationDraftResult> {
    await this.getEvent(eventId);
    const contentTaskId = this.getContentTaskId(eventId);
    const drafts = await this.prisma.contentDraft.findMany({
      where: {
        contentTaskId,
      },
      orderBy: {
        version: 'desc',
      },
    });

    return {
      eventId,
      contentTaskId,
      drafts: drafts as unknown as ContentDraft[],
    };
  }

  async generatePosts(input: {
    eventId: string;
    userInstruction?: string;
  }): Promise<HotspotOperationDraftResult> {
    const event = await this.getEvent(input.eventId);
    const evidenceRefs = this.normalizeStringArray(event.evidenceRefs);
    const evidence = await this.prisma.evidenceItem.findMany({
      where: {
        id: {
          in: evidenceRefs,
        },
      },
      orderBy: {
        observedAt: 'desc',
      },
    });

    if (evidence.length === 0) {
      throw new DomainError(
        'Hotspot operation requires resolvable event evidence.',
        'HOTSPOT_OPERATION_EVIDENCE_REQUIRED',
        { eventId: input.eventId },
      );
    }

    const contentTaskId = this.getContentTaskId(input.eventId);
    const drafts: ContentDraft[] = [];

    for (const index of [1, 2, 3]) {
      const draft = await this.contentGenerationAgent.generate({
        contentTask: this.createContentTask({
          event,
          contentTaskId,
          evidenceRefs: evidence.map((item) => item.id),
          index,
        }),
        accountPersona: '热点运营账号：关注行业热点、事件事实和可落地的产品承接角度。',
        contentRules: [
          '输出中文。',
          '生成一条适合 X/Twitter 发布的帖子。',
          '只使用证据中确认的事实，不编造数据。',
          '可以有观点和运营角度，但必须和事实区分。',
          '避免标题党、夸大、未经证实的断言。',
        ].join('\n'),
        generationPrompt: `请生成第 ${index} 条候选帖子。三条候选需要角度不同，避免互相重复。`,
        evidence: evidence as never,
        userInstruction: input.userInstruction,
      });
      drafts.push(draft);
    }

    return {
      eventId: input.eventId,
      contentTaskId,
      drafts,
    };
  }

  async publish(input: {
    eventId: string;
    draftId: string;
    url: string;
    accountName: string;
  }) {
    if (!input.accountName.trim()) {
      throw new DomainError(
        'Hotspot operation publish requires account name.',
        'HOTSPOT_OPERATION_ACCOUNT_REQUIRED',
        { eventId: input.eventId },
      );
    }

    const contentTaskId = this.getContentTaskId(input.eventId);
    const draft = await this.prisma.contentDraft.findFirst({
      where: {
        id: input.draftId,
        contentTaskId,
      },
    });

    if (!draft) {
      throw new DomainError(
        'Hotspot operation draft not found.',
        'HOTSPOT_OPERATION_DRAFT_NOT_FOUND',
        { eventId: input.eventId, draftId: input.draftId },
      );
    }

    return this.prisma.publishedPost.create({
      data: {
        contentTaskId,
        accountId: this.normalizeAccountId(input.accountName),
        accountName: input.accountName.trim(),
        platform: 'x',
        url: input.url,
        publishedAt: new Date(),
        trackingStatus: 'pending',
      },
    });
  }

  private async getEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: {
        id: eventId,
      },
    });

    if (!event) {
      throw new DomainError(
        'Hotspot operation event not found.',
        'HOTSPOT_OPERATION_EVENT_NOT_FOUND',
        { eventId },
      );
    }

    return event;
  }

  private getContentTaskId(eventId: string): string {
    return `hotspot_operation:${eventId}`;
  }

  private normalizeAccountId(accountName: string): string {
    return accountName
      .trim()
      .replace(/^@/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown-account';
  }

  private createContentTask(input: {
    event: {
      id: string;
      title: string;
      eventType: string;
      summary: string;
      confidence: string;
      missingData: Prisma.JsonValue;
      riskNotes: Prisma.JsonValue;
    };
    contentTaskId: string;
    evidenceRefs: string[];
    index: number;
  }): ContentTask {
    return {
      id: input.contentTaskId,
      targetType: 'event',
      targetId: input.event.id,
      accountId: 'hotspot-operation',
      contentType: 'x_post',
      contentGoal: `围绕事件“${input.event.title}”生成可发布帖子候选。`,
      angle: `candidate_${input.index}`,
      constraints: [
        `事件类型：${input.event.eventType}`,
        `置信度：${input.event.confidence}`,
        `事件摘要：${input.event.summary}`,
      ],
      evidenceRefs: input.evidenceRefs,
      status: 'drafting',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private normalizeStringArray(value: Prisma.JsonValue | JsonObject | unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }
}

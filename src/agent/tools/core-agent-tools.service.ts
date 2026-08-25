import { Injectable, OnModuleInit } from '@nestjs/common';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { PrismaService } from '../../database/prisma.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

@Injectable()
export class CoreAgentToolsService implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.registerSignalTools();
    this.registerEvidenceTools();
    this.registerOpportunityTools();
    this.registerEventTools();
    this.registerTopicWatchTools();
    this.registerTaskTools();
  }

  private registerSignalTools(): void {
    this.toolRegistry.register({
      name: 'signal.search',
      description:
        '按关键词、平台、信号类型检索标准化 Signal，用于判断近期是否存在相似信号。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          platform: { type: 'string' },
          signalType: { type: 'string' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'source',
        'platform',
        'signalType',
        'title',
        'summary',
        'observedAt',
        'metrics',
        'metadata',
      ]),
      execute: async (input) => {
        const query = this.optionalString(input.query);
        const items = await this.prisma.signal.findMany({
          where: {
            platform: this.optionalString(input.platform),
            signalType: this.optionalString(input.signalType),
            OR: query
              ? [
                  {
                    title: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                  {
                    summary: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                ]
              : undefined,
          },
          take: this.parseTake(input.take),
          orderBy: {
            observedAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });

    this.toolRegistry.register({
      name: 'signal.getRecent',
      description: '读取最近的标准化 Signal。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'source',
        'platform',
        'signalType',
        'title',
        'summary',
        'observedAt',
        'metrics',
      ]),
      execute: async (input) => {
        const items = await this.prisma.signal.findMany({
          take: this.parseTake(input.take),
          orderBy: {
            observedAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });
  }

  private registerEvidenceTools(): void {
    this.toolRegistry.register({
      name: 'evidence.search',
      description:
        '按关键词或 signalId 检索 Evidence，用于补充事实依据和可引用来源。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          signalId: { type: 'string' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'signalId',
        'sourceType',
        'claim',
        'text',
        'url',
        'author',
        'publishedAt',
        'observedAt',
        'metrics',
        'confidence',
      ]),
      execute: async (input) => {
        const query = this.optionalString(input.query);
        const items = await this.prisma.evidenceItem.findMany({
          where: {
            signalId: this.optionalString(input.signalId),
            OR: query
              ? [
                  {
                    claim: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                  {
                    text: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                ]
              : undefined,
          },
          take: this.parseTake(input.take),
          orderBy: {
            observedAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });
  }

  private registerOpportunityTools(): void {
    this.toolRegistry.register({
      name: 'opportunity.findSimilar',
      description: '按标题关键词查找相似机会，避免重复创建机会。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'title',
        'type',
        'summary',
        'status',
        'confidence',
        'evidenceRefs',
        'createdAt',
      ]),
      execute: async (input) => {
        const query = String(input.query ?? '');
        const items = await this.prisma.opportunity.findMany({
          where: {
            title: {
              contains: query,
              mode: 'insensitive',
            },
          },
          take: this.parseTake(input.take, 10),
          orderBy: {
            createdAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });

    this.toolRegistry.register({
      name: 'opportunity.getById',
      description: '按 id 读取机会详情。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'title',
        'type',
        'summary',
        'whyNow',
        'whyItMatters',
        'productAngles',
        'contentWindow',
        'evidenceRefs',
        'missingData',
        'riskNotes',
        'confidence',
        'status',
      ]),
      execute: async (input) => {
        const item = await this.prisma.opportunity.findUnique({
          where: {
            id: String(input.id),
          },
        });

        return this.toJson({ item });
      },
    });
  }

  private registerEventTools(): void {
    this.toolRegistry.register({
      name: 'event.findSimilar',
      description: '按标题关键词查找相似事件，避免重复形成事件。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'title',
        'eventType',
        'summary',
        'occurredAt',
        'status',
        'confidence',
        'evidenceRefs',
        'createdAt',
      ]),
      execute: async (input) => {
        const query = String(input.query ?? '');
        const items = await this.prisma.event.findMany({
          where: {
            title: {
              contains: query,
              mode: 'insensitive',
            },
          },
          take: this.parseTake(input.take, 10),
          orderBy: {
            createdAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });

    this.toolRegistry.register({
      name: 'event.getById',
      description: '按 id 读取事件详情。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'title',
        'eventType',
        'summary',
        'occurredAt',
        'evidenceRefs',
        'missingData',
        'riskNotes',
        'confidence',
        'status',
      ]),
      execute: async (input) => {
        const item = await this.prisma.event.findUnique({
          where: {
            id: String(input.id),
          },
        });

        return this.toJson({ item });
      },
    });
  }

  private registerTopicWatchTools(): void {
    this.toolRegistry.register({
      name: 'topicWatch.get',
      description: '按 id 读取主题追踪配置。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'name',
        'description',
        'domains',
        'watchIntent',
        'collectionPolicy',
        'triggerPolicy',
        'evidencePolicy',
        'exclusionPolicy',
        'status',
      ]),
      execute: async (input) => {
        const item = await this.prisma.topicWatch.findUnique({
          where: {
            id: String(input.id),
          },
        });

        return this.toJson({ item });
      },
    });

    this.toolRegistry.register({
      name: 'topicWatch.getCandidates',
      description: '读取某个主题下最近形成的候选话题。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['topicWatchId'],
        properties: {
          topicWatchId: { type: 'string' },
          status: { type: 'string' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'topicWatchId',
        'title',
        'summary',
        'keywords',
        'entities',
        'signalCount',
        'postCount',
        'accountCount',
        'sourceTypes',
        'representativeSignalIds',
        'evidenceRefs',
        'metrics',
        'status',
        'lastSeenAt',
      ]),
      execute: async (input) => {
        const items = await this.prisma.topicCandidate.findMany({
          where: {
            topicWatchId: String(input.topicWatchId),
            status: this.optionalString(input.status),
          },
          take: this.parseTake(input.take),
          orderBy: {
            lastSeenAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });
  }

  private registerTaskTools(): void {
    this.toolRegistry.register({
      name: 'tasks.findSimilar',
      description:
        '按目标、账号或任务状态查找已有分发项和内容任务，用于避免重复分发。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          targetType: { type: 'string' },
          targetId: { type: 'string' },
          accountId: { type: 'string' },
          status: { type: 'string' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'targetType',
        'targetId',
        'accountId',
        'contentType',
        'contentGoal',
        'angle',
        'status',
        'createdTaskId',
        'createdAt',
      ]),
      execute: async (input) => {
        const assignmentItems = await this.prisma.assignmentItem.findMany({
          where: {
            targetType: this.optionalString(input.targetType),
            targetId: this.optionalString(input.targetId),
            accountId: this.optionalString(input.accountId),
            status: this.optionalString(input.status),
          },
          take: this.parseTake(input.take),
          orderBy: {
            createdAt: 'desc',
          },
        });
        const contentTasks = await this.prisma.contentTask.findMany({
          where: {
            targetType: this.optionalString(input.targetType),
            targetId: this.optionalString(input.targetId),
            accountId: this.optionalString(input.accountId),
            status: this.optionalString(input.status),
          },
          take: this.parseTake(input.take),
          orderBy: {
            createdAt: 'desc',
          },
        });

        return this.toJson({
          assignmentItems,
          contentTasks,
        });
      },
    });
  }

  private fieldSelection(allowedFields: string[]) {
    return {
      supported: true,
      allowedFields,
      defaultFields: allowedFields.slice(0, 8),
    };
  }

  private optionalString(value: JsonValue | undefined): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private parseTake(value: JsonValue | undefined, fallback = 20): number {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(Math.trunc(parsed), 50);
  }

  private toJson(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }
}

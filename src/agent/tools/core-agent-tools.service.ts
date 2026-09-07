import { Injectable, OnModuleInit } from '@nestjs/common';
import { JsonObject, JsonValue } from '../../common/types/json.type';
import { PrismaService } from '../../database/prisma.service';
import { ProjectConfigService } from '../../project-config/project-config.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';

@Injectable()
export class CoreAgentToolsService implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly prisma: PrismaService,
    private readonly projectConfigService: ProjectConfigService,
  ) {}

  onModuleInit(): void {
    this.registerProjectConfigTools();
    this.registerSignalTools();
    this.registerXTrendTools();
    this.registerEvidenceTools();
    this.registerOpportunityTools();
    this.registerEventTools();
    this.registerTaskTools();
  }

  private registerProjectConfigTools(): void {
    this.toolRegistry.register({
      name: 'projectConfig.getXTrendConfig',
      description:
        '读取当前 X/Twitter 热榜采集配置，包括采集地区、每个地区榜单条数和自动采集间隔。适合回答“当前 X 热榜采集地区有哪些”“热榜多久采集一次”“每个地区采集多少条”等配置问题。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      fieldSelection: this.fieldSelection([
        'regions',
        'limit',
        'collectionIntervalMs',
      ]),
      execute: async () => {
        const config =
          await this.projectConfigService.getXTrendCollectionConfig();

        return this.toJson(config);
      },
    });
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

    this.toolRegistry.register({
      name: 'signal.getById',
      description: '按 ID 读取单条标准化 Signal。',
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
        const item = await this.prisma.signal.findUnique({
          where: {
            id: String(input.id),
          },
        });

        return this.toJson({ item });
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

    this.toolRegistry.register({
      name: 'evidence.getBySignalId',
      description: '按 Signal ID 读取相关 Evidence。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['signalId'],
        properties: {
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
        const items = await this.prisma.evidenceItem.findMany({
          where: {
            signalId: String(input.signalId),
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

  private registerXTrendTools(): void {
    this.toolRegistry.register({
      name: 'xTrend.getLatestRanking',
      description:
        '读取指定地区最新一次 X/Twitter 热搜榜快照，适合回答当前热搜排行、前 N 名、榜单列表等问题。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          region: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'region',
        'observedAt',
        'items',
      ]),
      execute: async (input) => {
        const region = this.normalizeXTrendRegion(input.region);
        const snapshot = await this.prisma.xTrendSnapshot.findFirst({
          where: {
            region,
          },
          orderBy: {
            observedAt: 'desc',
          },
          include: {
            items: {
              orderBy: {
                rank: 'asc',
              },
              take: this.parseTake(input.limit, 10),
            },
          },
        });

        return this.toJson({
          region,
          observedAt: snapshot?.observedAt ?? null,
          items:
            snapshot?.items.map((item) => ({
              id: item.id,
              name: item.name,
              query: item.query,
              rank: item.rank,
              url: item.url,
              heat: item.heat,
              category: item.category,
            })) ?? [],
        });
      },
    });

    this.toolRegistry.register({
      name: 'xTrend.getRecentDiffs',
      description:
        '按热搜 query 查询最近的 X 热榜快照差异，用于判断是否新进榜、排名上升或下降。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          region: { type: 'string' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'region',
        'query',
        'name',
        'previousRank',
        'currentRank',
        'rankDelta',
        'diffType',
        'observedAt',
      ]),
      execute: async (input) => {
        const query = String(input.query ?? '');
        const items = await this.prisma.xTrendSnapshotDiff.findMany({
          where: {
            region: this.optionalString(input.region),
            query: {
              contains: query,
              mode: 'insensitive',
            },
          },
          take: this.parseTake(input.take, 10),
          orderBy: {
            observedAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });

    this.toolRegistry.register({
      name: 'xTrend.getCrossRegionPresence',
      description:
        '查询同一 X 热搜 query 在最近窗口内出现过的地区，用于判断是否多地区同时或近似同时上榜。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          lookbackHours: { type: 'number' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'query',
        'regionCount',
        'regions',
        'items',
      ]),
      execute: async (input) => {
        const query = String(input.query ?? '');
        const lookbackHours = this.parseTake(input.lookbackHours, 24);
        const observedAfter = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
        const items = await this.prisma.xTrendSnapshotItem.findMany({
          where: {
            query: {
              contains: query,
              mode: 'insensitive',
            },
            snapshot: {
              observedAt: {
                gte: observedAfter,
              },
            },
          },
          take: this.parseTake(input.take, 50),
          orderBy: {
            snapshot: {
              observedAt: 'desc',
            },
          },
          include: {
            snapshot: {
              select: {
                region: true,
                observedAt: true,
              },
            },
          },
        });
        const normalizedItems = items.map((item) => ({
          id: item.id,
          query: item.query,
          name: item.name,
          rank: item.rank,
          region: item.snapshot.region,
          observedAt: item.snapshot.observedAt,
        }));
        const regions = Array.from(
          new Set(normalizedItems.map((item) => item.region)),
        );

        return this.toJson({
          query,
          regionCount: regions.length,
          regions,
          items: normalizedItems,
        });
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

  private normalizeXTrendRegion(value: JsonValue | undefined): string {
    const region = this.optionalString(value) ?? 'global';
    const normalized = region.trim().toLowerCase();

    if (normalized === 'worldwide' || normalized === 'world' || normalized === '全球') {
      return 'global';
    }

    return region;
  }

  private toJson(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }

  private calculateTrafficScore(value: JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return 0;
    }

    return (
      this.getNumber(value.likes) +
      this.getNumber(value.reposts) +
      this.getNumber(value.replies) +
      this.getNumber(value.quotes)
    );
  }

  private getMetadataString(value: JsonValue | null | undefined, key: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const item = value[key];
    return typeof item === 'string' && item.trim() ? item : undefined;
  }

  private getNumber(value: JsonValue | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}

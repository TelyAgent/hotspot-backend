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
    this.registerTopicWatchTools();
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

  private registerTopicWatchTools(): void {
    this.toolRegistry.register({
      name: 'topicWatch.list',
      description:
        '读取全部重点主题/主题圈配置，包含状态、领域、监控意图和启用监控账号概要。适合回答“配置了哪些主题圈”“每个主题有哪些账号”等运营问题。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          take: { type: 'number' },
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
        'accounts',
        'updatedAt',
      ]),
      execute: async (input) => {
        const items = await this.prisma.topicWatch.findMany({
          take: this.parseTake(input.take, 50),
          orderBy: {
            updatedAt: 'desc',
          },
          include: {
            accounts: {
              where: {
                status: 'active',
              },
              orderBy: {
                sortOrder: 'asc',
              },
              select: {
                handle: true,
                primaryRole: true,
                singleTriggerPolicy: true,
                authorityScope: true,
                status: true,
                sortOrder: true,
              },
            },
          },
        });

        return this.toJson({ items });
      },
    });

    this.toolRegistry.register({
      name: 'topicWatch.listActive',
      description:
        '读取当前启用的重点主题配置，用于判断热搜语义是否命中已配置重点主题。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        properties: {
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'id',
        'name',
        'description',
        'domains',
        'watchIntent',
        'triggerPolicy',
        'evidencePolicy',
        'exclusionPolicy',
        'status',
      ]),
      execute: async (input) => {
        const items = await this.prisma.topicWatch.findMany({
          where: {
            status: 'active',
          },
          take: this.parseTake(input.take, 50),
          orderBy: {
            updatedAt: 'desc',
          },
        });

        return this.toJson({ items });
      },
    });

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

    this.toolRegistry.register({
      name: 'topicWatch.getAuthorPostPerformance',
      description:
        '查询某个 X 账号近期帖子表现分位，用于判断某条帖子是否进入该账号近期表现前 5%。',
      permission: 'read',
      inputSchema: {
        type: 'object',
        required: ['authorHandle', 'postId'],
        properties: {
          authorHandle: { type: 'string' },
          postId: { type: 'string' },
          lookbackDays: { type: 'number' },
          take: { type: 'number' },
        },
      },
      fieldSelection: this.fieldSelection([
        'authorHandle',
        'postId',
        'targetScore',
        'sampleSize',
        'rank',
        'percentile',
        'isTop5Percent',
      ]),
      execute: async (input) => {
        const authorHandle = String(input.authorHandle ?? '').replace(/^@/, '');
        const postId = String(input.postId ?? '');
        const lookbackDays = this.parseTake(input.lookbackDays, 30);
        const observedAfter = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const items = await this.prisma.signal.findMany({
          where: {
            platform: 'x',
            signalType: 'x_post',
            observedAt: {
              gte: observedAfter,
            },
            metadata: {
              path: ['authorHandle'],
              equals: authorHandle,
            },
          },
          take: this.parseTake(input.take, 50),
          orderBy: {
            observedAt: 'desc',
          },
        });
        const scored = items
          .map((item) => ({
            id: item.id,
            postId: this.getMetadataString(item.metadata as JsonValue, 'postId'),
            score: this.calculateTrafficScore(item.metrics as JsonValue),
          }))
          .sort((left, right) => right.score - left.score);
        const targetIndex = scored.findIndex((item) => item.postId === postId);
        const target = targetIndex >= 0 ? scored[targetIndex] : undefined;
        const sampleSize = scored.length;
        const rank = target ? targetIndex + 1 : null;
        const percentile =
          rank && sampleSize > 0
            ? Math.round(((sampleSize - rank + 1) / sampleSize) * 100)
            : null;

        return this.toJson({
          authorHandle,
          postId,
          targetScore: target?.score ?? null,
          sampleSize,
          rank,
          percentile,
          isTop5Percent: rank !== null && sampleSize > 0 ? rank <= Math.max(1, Math.ceil(sampleSize * 0.05)) : null,
        });
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

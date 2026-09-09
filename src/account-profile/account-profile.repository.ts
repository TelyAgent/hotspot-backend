import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ListAccountProfilesOptions,
  LegacyKolAccountConfig,
  PostSignalRow,
} from './account-profile.types';

const LEGACY_KOL_ACCOUNTS_KEY = 'x.trends.kolAccounts';

@Injectable()
export class AccountProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(options: ListAccountProfilesOptions = {}) {
    const where: Prisma.AccountProfileWhereInput = {};

    if (typeof options.monitored === 'boolean') {
      where.monitorEnabled = options.monitored;
    }

    if (typeof options.active === 'boolean') {
      where.isActive = options.active;
    }

    if (typeof options.monitoring === 'boolean' && options.monitoring) {
      where.source = { in: ['manual', 'seed'] };
    }

    if (options.source) {
      where.source = options.source;
    }

    const query = options.query?.trim();
    if (query) {
      where.OR = [
        { handle: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ];
    }

    return this.prisma.accountProfile.findMany({
      where,
      orderBy: [{ monitorEnabled: 'desc' }, { handle: 'asc' }],
    });
  }

  async findByHandle(handle: string) {
    return this.prisma.accountProfile.findUnique({ where: { handle } });
  }

  async create(data: Prisma.AccountProfileUncheckedCreateInput) {
    return this.prisma.accountProfile.create({ data });
  }

  async update(handle: string, data: Prisma.AccountProfileUncheckedUpdateInput) {
    return this.prisma.accountProfile.update({ where: { handle }, data });
  }

  async remove(handle: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.accountProfile.deleteMany({ where: { handle } });

      if (deleted.count > 0) {
        await tx.accountProfileTombstone.upsert({
          where: { handle },
          update: { deletedAt: new Date() },
          create: { handle },
        });
      }

      return deleted.count;
    });
  }

  /**
   * 拉取用于互动指标聚合的帖子 signal。
   *
   * 用 observedAt 做索引友好的粗筛（SCAN_BUFFER_DAYS），
   * 真正的窗口判断在内存里按 metadata.publishedAt 做——不能用采集时刻算，
   * 否则重复采集同一条帖子会污染均值。
   */
  async findPostSignalsSince(since: Date, take = 20_000): Promise<PostSignalRow[]> {
    return this.prisma.signal.findMany({
      where: {
        source: 'x',
        signalType: 'x_post',
        observedAt: { gte: since },
      },
      select: { metadata: true, metrics: true },
      orderBy: { observedAt: 'desc' },
      take,
    });
  }

  async findManyByHandles(handles: string[]) {
    if (handles.length === 0) {
      return [];
    }

    return this.prisma.accountProfile.findMany({
      where: { handle: { in: handles } },
    });
  }

  /**
   * 拿需要静态资料刷新的账号：isActive=true，
   * 上次刷新超过 intervalMs 或从未刷过，且没在退避窗口内。
   */
  async findActiveDueAccounts(input: {
    intervalMs: number;
    retryBefore: Date;
    now: Date;
    take: number;
  }) {
    return this.prisma.accountProfile.findMany({
      where: {
        isActive: true,
        AND: [
          {
            OR: [
              { lastFetchedAt: null },
              { lastFetchedAt: { lt: new Date(input.now.getTime() - input.intervalMs) } },
            ],
          },
          {
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lt: input.retryBefore } },
            ],
          },
        ],
      },
      orderBy: { lastFetchedAt: 'asc' },
      take: input.take,
    });
  }

  /** 静态资料写入成功：填充 followers/displayName/bio/twitterUserId，保留人工 region/accountType。 */
  async applyFetchedProfile(input: {
    handle: string;
    twitterUserId: string | null;
    displayName: string | null;
    followers: number | null;
    bio: string | null;
    now: Date;
  }) {
    return this.prisma.accountProfile.update({
      where: { handle: input.handle },
      data: {
        twitterUserId: input.twitterUserId ?? undefined,
        displayName: input.displayName ?? undefined,
        followers: input.followers,
        bio: input.bio ?? undefined,
        lastFetchedAt: input.now,
        refreshAttemptCount: 0,
        nextRetryAt: null,
      },
    });
  }

  /** 静态资料写入失败：累计 attempts 并按 backoffMs 推后下次重试。 */
  async recordRefreshAttempt(input: { handle: string; backoffMs: number; now: Date }) {
    return this.prisma.accountProfile.update({
      where: { handle: input.handle },
      data: {
        refreshAttemptCount: { increment: 1 },
        nextRetryAt: new Date(input.now.getTime() + input.backoffMs),
      },
    });
  }

  /**
   * 找出最近一次静态资料刷新的完成时间（取所有账号 lastFetchedAt 的最大值）。
   * 用于调度器在重启后依然能保持"距离上次刷新 >= intervalMs 才执行"的语义。
   */
  async getMaxLastFetchedAt(): Promise<Date | null> {
    const row = await this.prisma.accountProfile.aggregate({
      _max: { lastFetchedAt: true },
      where: { lastFetchedAt: { not: null } },
    });
    return row._max.lastFetchedAt ?? null;
  }

  /**
   * 把窗口内没有发过帖的账号指标清零，避免使用过期数据参与筛选。
   * 必须在已命中的账号更新完成后调用。
   */
  async resetStaleEngagement(input: {
    activeBefore: Date;
    aggregatedAt: Date;
  }): Promise<number> {
    const result = await this.prisma.accountProfile.updateMany({
      where: {
        OR: [{ lastActiveAt: { lt: input.activeBefore } }, { lastActiveAt: null }],
      },
      data: {
        weeklyPosts: 0,
        avgComments: null,
        avgReposts: null,
        avgViews: null,
        avgLikes: null,
        lastAggregatedAt: input.aggregatedAt,
      },
    });

    return result.count;
  }

  async upsertSeed(data: Prisma.AccountProfileUncheckedCreateInput) {
    return this.prisma.accountProfile.upsert({
      where: { handle: data.handle },
      update: {},
      create: data,
    });
  }

  async listTombstoneHandles(): Promise<string[]> {
    const rows = await this.prisma.accountProfileTombstone.findMany({
      select: { handle: true },
    });
    return rows.map((row) => row.handle);
  }

  async deleteTombstone(handle: string) {
    await this.prisma.accountProfileTombstone.deleteMany({ where: { handle } });
  }

  async readLegacyKolAccounts(): Promise<LegacyKolAccountConfig[] | null> {
    const record = await this.prisma.projectConfig.findUnique({
      where: { key: LEGACY_KOL_ACCOUNTS_KEY },
    });

    if (!record || !Array.isArray(record.value)) {
      return null;
    }

    return normalizeLegacyAccounts(record.value);
  }

  async deleteLegacyKolAccountsKey(): Promise<void> {
    await this.prisma.projectConfig.deleteMany({
      where: { key: LEGACY_KOL_ACCOUNTS_KEY },
    });
  }
}

function normalizeLegacyAccounts(value: unknown): LegacyKolAccountConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const accounts: LegacyKolAccountConfig[] = [];

  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const handle = normalizeLegacyHandle(record.handle);
    if (!handle || seen.has(handle)) {
      continue;
    }

    seen.add(handle);
    accounts.push({
      handle,
      groupTag: typeof record.groupTag === 'string' && record.groupTag.trim()
        ? record.groupTag.trim()
        : null,
      joinedAt: parseLegacyDate(record.joinedAt),
      enabled: record.enabled === undefined ? true : Boolean(record.enabled),
    });
  }

  return accounts;
}

function normalizeLegacyHandle(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
}

function parseLegacyDate(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

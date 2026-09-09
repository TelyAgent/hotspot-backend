import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { AccountProfile } from '@prisma/client';
import { DEFAULT_KOL_RADAR_ACCOUNTS } from './account-profile.defaults';
import { AccountProfileRepository } from './account-profile.repository';
import {
  AccountProfileDto,
  CreateAccountProfileInput,
  ListAccountProfilesOptions,
  UpdateAccountProfileInput,
  normalizeHandle,
  toDisplayHandle,
} from './account-profile.types';

@Injectable()
export class AccountProfileService implements OnModuleInit {
  private readonly logger = new Logger(AccountProfileService.name);

  constructor(private readonly repository: AccountProfileRepository) {}

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyKolAccounts();
    await this.seedDefaultAccounts();
  }

  async list(options: ListAccountProfilesOptions = {}): Promise<AccountProfileDto[]> {
    const rows = await this.repository.findMany(options);
    return rows.map((row) => toDto(row));
  }

  async listMonitoredHandles(): Promise<string[]> {
    const rows = await this.repository.findMany({ monitored: true });
    return rows.map((row) => row.handle).filter(Boolean);
  }

  async findByHandle(handle: string): Promise<AccountProfileDto> {
    const row = await this.repository.findByHandle(normalizeHandle(handle));
    if (!row) {
      throw new NotFoundException(`账号 ${handle} 不存在`);
    }
    return toDto(row);
  }

  async create(input: CreateAccountProfileInput): Promise<AccountProfileDto> {
    const rawHandle = typeof input.handle === 'string' ? input.handle.trim() : '';
    const handle = normalizeHandle(rawHandle);

    if (!handle) {
      throw new BadRequestException('账号 handle 不能为空');
    }

    const existing = await this.repository.findByHandle(handle);
    if (existing) {
      throw new ConflictException(`账号 ${rawHandle} 已存在`);
    }

    await this.repository.deleteTombstone(handle);

    const row = await this.repository.create({
      handle,
      displayHandle: toDisplayHandle(rawHandle),
      groupTag: normalizeOptionalString(input.groupTag),
      monitorEnabled: input.monitorEnabled ?? true,
      joinedAt: input.joinedAt ?? new Date(),
      source: input.source ?? 'manual',
    });

    return toDto(row);
  }

  async update(
    handle: string,
    patch: UpdateAccountProfileInput,
  ): Promise<AccountProfileDto> {
    const normalizedHandle = normalizeHandle(handle);
    const existing = await this.repository.findByHandle(normalizedHandle);
    if (!existing) {
      throw new NotFoundException(`账号 ${handle} 不存在`);
    }

    const data: Parameters<AccountProfileRepository['update']>[1] = {};

    if (patch.groupTag !== undefined) {
      data.groupTag = normalizeOptionalString(patch.groupTag);
    }

    if (typeof patch.monitorEnabled === 'boolean') {
      data.monitorEnabled = patch.monitorEnabled;
    }

    if (typeof patch.isActive === 'boolean') {
      data.isActive = patch.isActive;
    }

    if (patch.region !== undefined) {
      data.region = normalizeOptionalString(patch.region);
      data.regionSource = normalizeOptionalString(patch.region) ? 'manual' : null;
    }

    if (patch.accountType !== undefined) {
      data.accountType = normalizeOptionalString(patch.accountType);
      data.accountTypeSource = normalizeOptionalString(patch.accountType)
        ? 'manual'
        : null;
    }

    if (patch.displayName !== undefined) {
      data.displayName = normalizeOptionalString(patch.displayName);
    }

    if (patch.bio !== undefined) {
      data.bio = normalizeOptionalString(patch.bio);
    }

    const row = await this.repository.update(normalizedHandle, data);
    return toDto(row);
  }

  async remove(handle: string): Promise<void> {
    const normalizedHandle = normalizeHandle(handle);
    const deleted = await this.repository.remove(normalizedHandle);

    if (deleted === 0) {
      throw new NotFoundException(`账号 ${handle} 不存在`);
    }
  }

  private async migrateLegacyKolAccounts(): Promise<void> {
    const legacyAccounts = await this.repository.readLegacyKolAccounts();
    if (!legacyAccounts) {
      return;
    }

    let migrated = 0;

    for (const account of legacyAccounts) {
      const handle = normalizeHandle(account.handle);
      if (!handle) {
        continue;
      }

      const joinedAt = new Date(account.joinedAt);
      const existing = await this.repository.findByHandle(handle);

      if (existing) {
        await this.repository.update(handle, {
          monitorEnabled: account.enabled,
          groupTag: account.groupTag,
          joinedAt: Number.isNaN(joinedAt.getTime()) ? undefined : joinedAt,
          source: 'seed',
          displayHandle: existing.displayHandle ?? toDisplayHandle(account.handle),
        });
      } else {
        await this.repository.create({
          handle,
          displayHandle: toDisplayHandle(account.handle),
          groupTag: account.groupTag,
          monitorEnabled: account.enabled,
          joinedAt: Number.isNaN(joinedAt.getTime()) ? new Date() : joinedAt,
          source: 'seed',
        });
      }

      migrated += 1;
    }

    await this.repository.deleteLegacyKolAccountsKey();
    this.logger.log(
      `Migrated ${migrated} KOL accounts from project_configs to account_profiles`,
    );
  }

  private async seedDefaultAccounts(): Promise<void> {
    const tombstones = new Set(await this.repository.listTombstoneHandles());
    let created = 0;

    for (const account of DEFAULT_KOL_RADAR_ACCOUNTS) {
      const handle = normalizeHandle(account.handle);
      if (!handle || tombstones.has(handle)) {
        continue;
      }

      const existing = await this.repository.findByHandle(handle);
      if (existing) {
        continue;
      }

      const joinedAt = new Date(account.joinedAt);
      await this.repository.upsertSeed({
        handle,
        displayHandle: toDisplayHandle(account.handle),
        groupTag: account.groupTag,
        monitorEnabled: account.enabled,
        joinedAt: Number.isNaN(joinedAt.getTime()) ? new Date() : joinedAt,
        source: 'seed',
      });
      created += 1;
    }

    if (created > 0) {
      this.logger.log(`Seeded ${created} default KOL accounts into account_profiles`);
    }
  }
}

function toDto(row: AccountProfile): AccountProfileDto {
  return {
    handle: row.handle,
    displayHandle: row.displayHandle,
    displayName: row.displayName,
    followers: row.followers,
    region: row.region,
    regionSource: row.regionSource,
    bio: row.bio,
    accountType: row.accountType,
    monitorEnabled: row.monitorEnabled,
    groupTag: row.groupTag,
    joinedAt: row.joinedAt.toISOString(),
    source: row.source,
    weeklyPosts: row.weeklyPosts,
    avgComments: row.avgComments,
    avgReposts: row.avgReposts,
    avgViews: row.avgViews,
    avgLikes: row.avgLikes,
    lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
    isActive: row.isActive,
    lastFetchedAt: row.lastFetchedAt ? row.lastFetchedAt.toISOString() : null,
    lastAggregatedAt: row.lastAggregatedAt
      ? row.lastAggregatedAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const next = value.trim();
  return next ? next : null;
}

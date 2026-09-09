import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountProfile } from '@prisma/client';
import { AccountProfileRepository } from './account-profile.repository';
import { REGION_FALLBACK, resolveRegionFromLocation } from './account-profile.region';
import {
  AccountProfileRefreshOptions,
  AccountProfileRefreshResult,
} from './account-profile.types';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ACCOUNTS = 500;
const HOUR_MS = 60 * 60 * 1000;

/** 退避阶梯（小时），最后一次之后封顶 24h */
const BACKOFF_HOURS = [1, 3, 6, 12, 24];
const BACKOFF_MAX_HOURS = 24;

type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

interface TwitterApiIoUserData {
  id?: string;
  userName?: string;
  name?: string;
  followers?: number | null;
  following?: number | null;
  location?: string | null;
  description?: string | null;
  statusesCount?: number | null;
  [key: string]: unknown;
}

interface TwitterApiIoResponse {
  status?: 'success' | 'error';
  msg?: string;
  message?: string;
  data?: unknown;
}

/**
 * 静态资料刷新服务。
 *
 * 流程：
 *  1. 取 isActive=true 且到期 / 未刷过 / 退避窗口外的账号。
 *  2. 没有 twitterUserId 的走单次 `/twitter/user/info?userName=` 拿 id。
 *  3. 有 twitterUserId 的按批走 `/twitter/user/batch_info_by_ids?userIds=`（默认 100 个一批）。
 *  4. 写入时人工 region/accountType 不覆盖，displayName 仅在未填时落库。
 *  5. 失败：累加 attempts，按阶梯 [1h, 3h, 6h, 12h, 24h, 24h…] 写入 nextRetryAt。
 */
@Injectable()
export class AccountProfileRefreshService {
  private readonly logger = new Logger(AccountProfileRefreshService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly repository: AccountProfileRepository,
  ) {}

  async refreshActiveAccounts(
    options: AccountProfileRefreshOptions = {},
  ): Promise<AccountProfileRefreshResult> {
    const now = options.now ?? new Date();
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const maxAccounts = options.maxAccounts ?? DEFAULT_MAX_ACCOUNTS;
    const apiKey = this.configService.get<string>('TWITTERAPI_IO_KEY');

    if (!apiKey) {
      this.logger.warn('TWITTERAPI_IO_KEY is not configured; skip account profile refresh.');
      return {
        scanned: 0,
        refreshed: 0,
        failed: 0,
        skippedMissingKey: true,
        finishedAt: now.toISOString(),
      };
    }

    const fetcher = globalThis.fetch as Fetcher | undefined;
    if (!fetcher) {
      this.logger.error('fetch is not available in this runtime; skip account profile refresh.');
      return {
        scanned: 0,
        refreshed: 0,
        failed: 0,
        skippedMissingKey: false,
        finishedAt: now.toISOString(),
      };
    }

    const baseUrl = (
      this.configService.get<string>('TWITTERAPI_BASE_URL') ?? 'https://api.twitterapi.io'
    ).replace(/\/$/, '');

    const due = await this.repository.findActiveDueAccounts({
      intervalMs,
      retryBefore: now,
      now,
      take: maxAccounts,
    });

    if (due.length === 0) {
      return {
        scanned: 0,
        refreshed: 0,
        failed: 0,
        skippedMissingKey: false,
        finishedAt: now.toISOString(),
      };
    }

    const needUserId = due.filter((account) => !account.twitterUserId);
    const haveUserId = due.filter((account) => Boolean(account.twitterUserId));

    let refreshed = 0;
    let failed = 0;

    for (const account of needUserId) {
      try {
        const data = await this.fetchSingleUser({
          handle: account.handle,
          baseUrl,
          apiKey,
          fetcher,
        });

        if (!data) {
          await this.recordFailure(account, 'empty response', now);
          failed += 1;
          continue;
        }

        await this.applyProfile(account, data, now);
        refreshed += 1;
      } catch (error) {
        await this.recordFailure(
          account,
          error instanceof Error ? error.message : String(error),
          now,
        );
        failed += 1;
      }
    }

    for (let i = 0; i < haveUserId.length; i += batchSize) {
      const chunk = haveUserId.slice(i, i + batchSize);
      const userIds = chunk.map((account) => account.twitterUserId as string);

      let users: TwitterApiIoUserData[] = [];
      try {
        users = await this.fetchBatchUsers({ userIds, baseUrl, apiKey, fetcher });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const account of chunk) {
          await this.recordFailure(account, message, now);
          failed += 1;
        }
        continue;
      }

      const byId = new Map<string, TwitterApiIoUserData>();
      for (const user of users) {
        if (user.id) {
          byId.set(user.id, user);
        }
      }

      for (const account of chunk) {
        const data = byId.get(account.twitterUserId as string);
        if (!data) {
          await this.recordFailure(account, 'user missing from batch response', now);
          failed += 1;
          continue;
        }
        await this.applyProfile(account, data, now);
        refreshed += 1;
      }
    }

    this.logger.log(
      `Account profile refresh finished: scanned=${due.length}, refreshed=${refreshed}, failed=${failed}`,
    );

    return {
      scanned: due.length,
      refreshed,
      failed,
      skippedMissingKey: false,
      finishedAt: now.toISOString(),
    };
  }

  private async fetchSingleUser(input: {
    handle: string;
    baseUrl: string;
    apiKey: string;
    fetcher: Fetcher;
  }): Promise<TwitterApiIoUserData | null> {
    const url = `${input.baseUrl}/twitter/user/info?userName=${encodeURIComponent(input.handle)}`;
    const response = await input.fetcher(url, {
      headers: { 'X-API-Key': input.apiKey },
    });
    const body = (await response.json()) as TwitterApiIoResponse;

    if (!response.ok || body.status === 'error') {
      throw new Error(
        body.msg ?? body.message ?? `${response.status} ${response.statusText}`.trim(),
      );
    }

    return asUserData(body.data);
  }

  private async fetchBatchUsers(input: {
    userIds: string[];
    baseUrl: string;
    apiKey: string;
    fetcher: Fetcher;
  }): Promise<TwitterApiIoUserData[]> {
    const url = `${input.baseUrl}/twitter/user/batch_info_by_ids?userIds=${encodeURIComponent(
      input.userIds.join(','),
    )}`;
    const response = await input.fetcher(url, {
      headers: { 'X-API-Key': input.apiKey },
    });
    const body = (await response.json()) as TwitterApiIoResponse;

    if (!response.ok || body.status === 'error') {
      throw new Error(
        body.msg ?? body.message ?? `${response.status} ${response.statusText}`.trim(),
      );
    }

    return asUserDataList(body.data);
  }

  private async applyProfile(
    account: AccountProfile,
    data: TwitterApiIoUserData,
    now: Date,
  ) {
    const id = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : null;
    const displayName =
      typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null;
    const bio =
      typeof data.description === 'string' && data.description.trim()
        ? data.description.trim()
        : null;
    const followers = asInteger(data.followers);

    await this.repository.applyFetchedProfile({
      handle: account.handle,
      twitterUserId: id,
      displayName,
      followers,
      bio,
      now,
    });

    if (typeof data.location === 'string') {
      // 人工标签 regionSource='manual' 时不覆盖
      if (account.regionSource !== 'manual') {
        const region = resolveRegionFromLocation(data.location);
        const regionSource = region === REGION_FALLBACK ? 'auto' : 'auto';
        await this.repository.update(account.handle, {
          region: region === REGION_FALLBACK ? null : region,
          regionSource,
        });
      }
    }
  }

  private async recordFailure(account: AccountProfile, error: string, now: Date) {
    const attemptIndex = Math.min(account.refreshAttemptCount, BACKOFF_HOURS.length - 1);
    const backoffHours = Math.min(
      BACKOFF_HOURS[attemptIndex] ?? BACKOFF_MAX_HOURS,
      BACKOFF_MAX_HOURS,
    );
    const backoffMs = backoffHours * HOUR_MS;
    await this.repository.recordRefreshAttempt({
      handle: account.handle,
      backoffMs,
      now,
    });
    this.logger.warn(
      `Refresh failed for @${account.handle}: ${error}; retry in ${backoffHours}h`,
    );
  }
}

function asUserData(value: unknown): TwitterApiIoUserData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as TwitterApiIoUserData;
}

function asUserDataList(value: unknown): TwitterApiIoUserData[] {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => item as TwitterApiIoUserData);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.users)) {
      return record.users
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item) => item as TwitterApiIoUserData);
    }
    if (Array.isArray(record.data)) {
      return record.data
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item) => item as TwitterApiIoUserData);
    }
  }
  return [];
}

function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Math.max(0, Math.floor(Number(value)));
  }
  return null;
}

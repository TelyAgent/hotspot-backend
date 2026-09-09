import { ConfigService } from '@nestjs/config';
import type { AccountProfile } from '@prisma/client';
import { AccountProfileRefreshService } from '../../../src/account-profile/account-profile-refresh.service';
import { AccountProfileRepository } from '../../../src/account-profile/account-profile.repository';
import { resolveRegionFromLocation, REGION_FALLBACK } from '../../../src/account-profile/account-profile.region';

const NOW = new Date('2026-09-08T12:00:00.000Z');

function makeAccount(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return {
    handle: 'alice',
    displayHandle: 'Alice',
    displayName: null,
    twitterUserId: null,
    followers: null,
    region: null,
    regionSource: null,
    bio: null,
    accountType: null,
    accountTypeSource: null,
    monitorEnabled: false,
    groupTag: null,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    source: 'manual',
    weeklyPosts: 0,
    avgComments: null,
    avgReposts: null,
    avgViews: null,
    avgLikes: null,
    lastActiveAt: null,
    isActive: true,
    lastFetchedAt: null,
    lastAggregatedAt: null,
    refreshAttemptCount: 0,
    nextRetryAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AccountProfile;
}

describe('resolveRegionFromLocation', () => {
  it('命中英文/中文城市/国家关键词', () => {
    expect(resolveRegionFromLocation('San Francisco, CA')).toBe('美国');
    expect(resolveRegionFromLocation('London, UK')).toBe('英国');
    expect(resolveRegionFromLocation('日本 東京')).toBe('日本');
    expect(resolveRegionFromLocation('Seoul, South Korea')).toBe('韩国');
    expect(resolveRegionFromLocation('Singapore')).toBe('新加坡');
  });

  it('空串、null、未命中关键词统一归"未知"', () => {
    expect(resolveRegionFromLocation('')).toBe(REGION_FALLBACK);
    expect(resolveRegionFromLocation(null)).toBe(REGION_FALLBACK);
    expect(resolveRegionFromLocation('Mars Colony')).toBe(REGION_FALLBACK);
  });
});

describe('AccountProfileRefreshService', () => {
  function makeService(input: {
    config?: Record<string, string | undefined>;
    repository: Partial<AccountProfileRepository>;
    fetcher?: jest.Mock;
  }) {
    const configService = {
      get: (key: string) => input.config?.[key],
    } as unknown as ConfigService;
    const repository = {
      findActiveDueAccounts: jest.fn(),
      applyFetchedProfile: jest.fn().mockResolvedValue({}),
      recordRefreshAttempt: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      ...input.repository,
    } as unknown as AccountProfileRepository;
    const fetcher = input.fetcher ?? jest.fn();
    // 把 fetcher 注入到 globalThis.fetch
    Object.defineProperty(globalThis, 'fetch', {
      value: fetcher,
      writable: true,
      configurable: true,
    });
    return {
      service: new AccountProfileRefreshService(configService, repository),
      repository,
      fetcher,
    };
  }

  it('缺少 TWITTERAPI_IO_KEY 时安全跳过并返回 skippedMissingKey', async () => {
    const { service, repository, fetcher } = makeService({
      config: { TWITTERAPI_IO_KEY: undefined },
      repository: {},
    });

    const result = await service.refreshActiveAccounts({ now: NOW });

    expect(result.skippedMissingKey).toBe(true);
    expect(result.scanned).toBe(0);
    expect(repository.findActiveDueAccounts).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('没有到期账号时直接返回零计数', async () => {
    const { service, repository } = makeService({
      config: { TWITTERAPI_IO_KEY: 'key' },
      repository: {
        findActiveDueAccounts: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await service.refreshActiveAccounts({ now: NOW });

    expect(result.scanned).toBe(0);
    expect(result.refreshed).toBe(0);
    expect(result.failed).toBe(0);
    expect(repository.findActiveDueAccounts).toHaveBeenCalledWith(
      expect.objectContaining({ now: NOW, take: expect.any(Number) }),
    );
  });

  it('无 userId 的账号走单次 /user/info 并写入资料；region 走 auto 识别', async () => {
    const account = makeAccount({ handle: 'reuters', twitterUserId: null });
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        status: 'success',
        data: {
          id: 'r-uid',
          name: 'Reuters',
          followers: 26_000_000,
          location: 'London, UK',
          description: 'Top news',
        },
      }),
    });

    const { service, repository } = makeService({
      config: { TWITTERAPI_IO_KEY: 'k' },
      repository: {
        findActiveDueAccounts: jest.fn().mockResolvedValue([account]),
      },
      fetcher,
    });

    const result = await service.refreshActiveAccounts({ now: NOW });

    expect(result.refreshed).toBe(1);
    expect(result.failed).toBe(0);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/twitter/user/info?userName=reuters'),
      expect.objectContaining({ headers: { 'X-API-Key': 'k' } }),
    );
    expect(repository.applyFetchedProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'reuters',
        twitterUserId: 'r-uid',
        followers: 26_000_000,
        bio: 'Top news',
      }),
    );
    expect(repository.update).toHaveBeenCalledWith(
      'reuters',
      expect.objectContaining({ region: '英国', regionSource: 'auto' }),
    );
  });

  it('有 userId 的账号按批走 /batch_info_by_ids，并把单条缺失标记为失败', async () => {
    const accounts = [
      makeAccount({ handle: 'openai', twitterUserId: 'oa-1' }),
      makeAccount({ handle: 'anthropicai', twitterUserId: 'an-1' }),
    ];
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        status: 'success',
        data: [
          { id: 'oa-1', name: 'OpenAI', followers: 4_800_000, location: 'San Francisco' },
        ],
      }),
    });

    const { service, repository } = makeService({
      config: { TWITTERAPI_IO_KEY: 'k' },
      repository: {
        findActiveDueAccounts: jest.fn().mockResolvedValue(accounts),
      },
      fetcher,
    });

    const result = await service.refreshActiveAccounts({ now: NOW });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetcher.mock.calls[0][0]);
    expect(calledUrl).toContain('/twitter/user/batch_info_by_ids?userIds=');
    expect(decodeURIComponent(calledUrl)).toContain('userIds=oa-1,an-1');
    expect(result.refreshed).toBe(1);
    expect(result.failed).toBe(1);
    expect(repository.recordRefreshAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'anthropicai' }),
    );
  });

  it('人工 region（regionSource=manual）不会被自动识别覆盖', async () => {
    const account = makeAccount({
      handle: 'kol-1',
      twitterUserId: 'k-1',
      region: '日本',
      regionSource: 'manual',
    });
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        status: 'success',
        data: [{ id: 'k-1', followers: 100, location: 'San Francisco' }],
      }),
    });

    const { service, repository } = makeService({
      config: { TWITTERAPI_IO_KEY: 'k' },
      repository: {
        findActiveDueAccounts: jest.fn().mockResolvedValue([account]),
      },
      fetcher,
    });

    await service.refreshActiveAccounts({ now: NOW });

    // 不应该有 update region 的调用
    const updateCalls = (repository.update as jest.Mock).mock.calls;
    for (const [, data] of updateCalls) {
      expect(data.region).toBeUndefined();
    }
  });

  it('整个 batch 请求失败时把整批账号都记入退避', async () => {
    const accounts = [
      makeAccount({ handle: 'a', twitterUserId: 'a-1' }),
      makeAccount({ handle: 'b', twitterUserId: 'b-1' }),
    ];
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ status: 'error', msg: 'oops' }),
    });

    const { service, repository } = makeService({
      config: { TWITTERAPI_IO_KEY: 'k' },
      repository: {
        findActiveDueAccounts: jest.fn().mockResolvedValue(accounts),
      },
      fetcher,
    });

    const result = await service.refreshActiveAccounts({ now: NOW });

    expect(result.failed).toBe(2);
    expect(result.refreshed).toBe(0);
    expect(repository.recordRefreshAttempt).toHaveBeenCalledTimes(2);
  });
});

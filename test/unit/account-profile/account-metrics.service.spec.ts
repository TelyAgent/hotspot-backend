import { AccountMetricsService, aggregatePostSignals } from '../../../src/account-profile/account-metrics.service';
import { AccountProfileRepository } from '../../../src/account-profile/account-profile.repository';
import { PostSignalRow } from '../../../src/account-profile/account-profile.types';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const WINDOW_START = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);

function post(options: {
  handle: string;
  postId: string;
  publishedAt: string;
  views?: number | null;
  likes?: number | null;
  reposts?: number | null;
  replies?: number | null;
  postType?: string;
  authorId?: string | null;
  authorName?: string | null;
}): PostSignalRow {
  return {
    metadata: {
      authorHandle: options.handle,
      authorName: options.authorName ?? null,
      authorId: options.authorId ?? null,
      postId: options.postId,
      postType: options.postType ?? 'original',
      publishedAt: options.publishedAt,
    },
    metrics: {
      views: options.views ?? null,
      likes: options.likes ?? null,
      reposts: options.reposts ?? null,
      replies: options.replies ?? null,
    },
  };
}

describe('aggregatePostSignals', () => {
  it('按作者聚合近 7 天指标，并排除窗口外的帖子', () => {
    const rows = [
      post({ handle: 'alice', postId: 'p1', publishedAt: '2026-09-07T00:00:00.000Z', views: 100, likes: 10, reposts: 4, replies: 2 }),
      post({ handle: 'alice', postId: 'p2', publishedAt: '2026-09-06T00:00:00.000Z', views: 200, likes: 20, reposts: 6, replies: 4 }),
      post({ handle: 'alice', postId: 'old', publishedAt: '2026-08-01T00:00:00.000Z', views: 9_999, likes: 9_999 }),
      post({ handle: '@Bob', postId: 'p3', publishedAt: '2026-09-05T00:00:00.000Z', views: 50, likes: 5 }),
    ];

    const result = aggregatePostSignals(rows, { windowStart: WINDOW_START, now: NOW });

    expect(result.matchedSignals).toBe(3);
    expect(result.authors).toHaveLength(2);

    const alice = result.authors.find((item) => item.handle === 'alice');
    expect(alice).toBeDefined();
    expect(alice?.weeklyPosts).toBe(2);
    expect(alice?.avgViews).toBe(150);
    expect(alice?.avgLikes).toBe(15);
    expect(alice?.avgReposts).toBe(5);
    expect(alice?.avgComments).toBe(3);
    expect(alice?.lastActiveAt?.toISOString()).toBe('2026-09-07T00:00:00.000Z');

    const bob = result.authors.find((item) => item.handle === 'bob');
    expect(bob?.displayHandle).toBe('Bob');
    expect(bob?.avgViews).toBe(50);
    expect(bob?.avgComments).toBeNull();
  });

  it('默认排除转发帖，includeReposts 时可计入', () => {
    const rows = [
      post({ handle: 'carol', postId: 'r1', publishedAt: '2026-09-07T00:00:00.000Z', views: 10, postType: 'repost' }),
      post({ handle: 'carol', postId: 'o1', publishedAt: '2026-09-07T00:00:00.000Z', views: 90 }),
    ];

    const excluded = aggregatePostSignals(rows, { windowStart: WINDOW_START, now: NOW });
    expect(excluded.authors[0].weeklyPosts).toBe(1);
    expect(excluded.authors[0].avgViews).toBe(90);

    const included = aggregatePostSignals(rows, {
      windowStart: WINDOW_START,
      now: NOW,
      includeReposts: true,
    });
    expect(included.authors[0].weeklyPosts).toBe(2);
  });

  it('同一 postId 重复出现只计一次', () => {
    const rows = [
      post({ handle: 'dave', postId: 'same', publishedAt: '2026-09-07T00:00:00.000Z', views: 100 }),
      post({ handle: 'dave', postId: 'same', publishedAt: '2026-09-07T00:00:00.000Z', views: 100 }),
    ];

    const result = aggregatePostSignals(rows, { windowStart: WINDOW_START, now: NOW });
    expect(result.authors[0].weeklyPosts).toBe(1);
    expect(result.matchedSignals).toBe(1);
  });

  it('跳过缺少 handle 或时间不可解析的记录', () => {
    const rows: PostSignalRow[] = [
      { metadata: { postId: 'x', publishedAt: '2026-09-07T00:00:00.000Z' }, metrics: {} },
      { metadata: { authorHandle: 'eve', postId: 'y', publishedAt: 'not-a-date' }, metrics: {} },
      { metadata: null, metrics: null },
    ];

    const result = aggregatePostSignals(rows, { windowStart: WINDOW_START, now: NOW });
    expect(result.authors).toHaveLength(0);
    expect(result.matchedSignals).toBe(0);
  });
});

describe('AccountMetricsService', () => {
  function createRepository(overrides: Partial<AccountProfileRepository> = {}) {
    return {
      findPostSignalsSince: jest.fn().mockResolvedValue([]),
      findManyByHandles: jest.fn().mockResolvedValue([]),
      listTombstoneHandles: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      resetStaleEngagement: jest.fn().mockResolvedValue(0),
      ...overrides,
    } as unknown as AccountProfileRepository;
  }

  it('已存在的账号只更新指标，不覆盖人工维护的资料', async () => {
    const repository = createRepository({
      findPostSignalsSince: jest.fn().mockResolvedValue([
        post({
          handle: 'alice',
          postId: 'p1',
          publishedAt: '2026-09-07T00:00:00.000Z',
          views: 100,
          authorId: 'uid-1',
          authorName: 'Alice Tweet',
        }),
      ]),
      findManyByHandles: jest.fn().mockResolvedValue([
        {
          handle: 'alice',
          displayName: 'Alice（人工）',
          twitterUserId: 'manual-uid',
        },
      ]),
    });

    const service = new AccountMetricsService(repository);
    const result = await service.refreshEngagement({ now: NOW });

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(repository.update).toHaveBeenCalledTimes(1);
    const [handle, patch] = (repository.update as jest.Mock).mock.calls[0];
    expect(handle).toBe('alice');
    expect(patch.displayName).toBe('Alice（人工）');
    expect(patch.twitterUserId).toBe('manual-uid');
    expect(patch.weeklyPosts).toBe(1);
    expect(patch.isActive).toBe(true);
  });

  it('新 handle 以 discovered 身份入库且不进采集名单，墓碑中的 handle 被跳过', async () => {
    const repository = createRepository({
      findPostSignalsSince: jest.fn().mockResolvedValue([
        post({ handle: 'newbie', postId: 'p1', publishedAt: '2026-09-07T00:00:00.000Z', views: 10 }),
        post({ handle: 'zombie', postId: 'p2', publishedAt: '2026-09-07T00:00:00.000Z', views: 10 }),
      ]),
      listTombstoneHandles: jest.fn().mockResolvedValue(['zombie']),
    });

    const service = new AccountMetricsService(repository);
    const result = await service.refreshEngagement({ now: NOW });

    expect(result.created).toBe(1);
    expect(result.skippedTombstoned).toBe(1);
    expect(repository.create).toHaveBeenCalledTimes(1);
    const created = (repository.create as jest.Mock).mock.calls[0][0];
    expect(created.handle).toBe('newbie');
    expect(created.source).toBe('discovered');
    expect(created.monitorEnabled).toBe(false);
  });

  it('窗口天数被夹在 1 到 30 之间，并把过期账号指标清零', async () => {
    const repository = createRepository();
    const service = new AccountMetricsService(repository);

    const result = await service.refreshEngagement({ now: NOW, windowDays: 999 });

    expect(result.windowDays).toBe(30);
    expect(repository.resetStaleEngagement).toHaveBeenCalledTimes(1);
    const resetInput = (repository.resetStaleEngagement as jest.Mock).mock.calls[0][0];
    expect(resetInput.aggregatedAt.toISOString()).toBe(NOW.toISOString());
  });
});

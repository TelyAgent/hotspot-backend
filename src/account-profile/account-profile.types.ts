export const ACCOUNT_PROFILE_SOURCES = ['manual', 'seed', 'discovered'] as const;

export type AccountProfileSource = (typeof ACCOUNT_PROFILE_SOURCES)[number];

export const ACCOUNT_TYPES = [
  'official',
  'kol',
  'media',
  'project',
  'institution',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface AccountProfileDto {
  handle: string;
  displayHandle: string | null;
  displayName: string | null;
  followers: number | null;
  region: string | null;
  regionSource: string | null;
  bio: string | null;
  accountType: string | null;
  monitorEnabled: boolean;
  groupTag: string | null;
  joinedAt: string;
  source: string;
  weeklyPosts: number;
  avgComments: number | null;
  avgReposts: number | null;
  avgViews: number | null;
  avgLikes: number | null;
  lastActiveAt: string | null;
  isActive: boolean;
  lastFetchedAt: string | null;
  lastAggregatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListAccountProfilesOptions {
  monitored?: boolean;
  monitoring?: boolean;
  active?: boolean;
  source?: AccountProfileSource;
  query?: string;
}

export interface CreateAccountProfileInput {
  handle: string;
  groupTag?: string | null;
  monitorEnabled?: boolean;
  joinedAt?: Date;
  source?: AccountProfileSource;
}

export interface UpdateAccountProfileInput {
  groupTag?: string | null;
  monitorEnabled?: boolean;
  region?: string | null;
  accountType?: string | null;
  displayName?: string | null;
  bio?: string | null;
  isActive?: boolean;
}

export interface LegacyKolAccountConfig {
  handle: string;
  groupTag: string | null;
  joinedAt: string;
  enabled: boolean;
}

/**
 * signals 表中的一条 x_post 记录，仅保留聚合需要的两个 JSON 字段。
 * 用 unknown 而非 Prisma.JsonValue，便于在单测里直接构造假数据。
 */
export interface PostSignalRow {
  metadata?: unknown;
  metrics?: unknown;
}

export interface AccountEngagementMetrics {
  weeklyPosts: number;
  avgComments: number | null;
  avgReposts: number | null;
  avgViews: number | null;
  avgLikes: number | null;
  lastActiveAt: Date | null;
}

export interface AuthorEngagementWindow extends AccountEngagementMetrics {
  handle: string;
  displayHandle: string | null;
  displayName: string | null;
  twitterUserId: string | null;
}

export interface EngagementRefreshResult {
  windowDays: number;
  windowStart: string;
  scannedSignals: number;
  matchedSignals: number;
  authors: number;
  updated: number;
  created: number;
  skippedTombstoned: number;
  resetStale: number;
  finishedAt: string;
}

export interface AccountProfileRefreshResult {
  scanned: number;
  refreshed: number;
  failed: number;
  skippedMissingKey: boolean;
  finishedAt: string;
}

export interface AccountProfileRefreshOptions {
  intervalMs?: number;
  batchSize?: number;
  maxAccounts?: number;
  now?: Date;
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function toDisplayHandle(value: string): string {
  return value.trim().replace(/^@/, '');
}

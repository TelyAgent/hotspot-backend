import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_X_TREND_COLLECTION_CONFIG,
  PROJECT_CONFIG_DESCRIPTIONS,
} from './project-config.defaults';
import { ProjectConfigRepository } from './project-config.repository';
import { KolRadarAccountConfig, XTrendCollectionConfig } from './project-config.types';
import { JsonValue } from '../common/types/json.type';

@Injectable()
export class ProjectConfigService implements OnModuleInit {
  constructor(private readonly repository: ProjectConfigRepository) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  async seedDefaults(): Promise<void> {
    const defaults = DEFAULT_X_TREND_COLLECTION_CONFIG;
    await this.seedDefault('x.trends.regions', defaults.regions);
    await this.seedDefault('x.trends.limit', defaults.limit);
    await this.seedDefault(
      'x.trends.collectionIntervalMs',
      defaults.collectionIntervalMs,
    );
    await this.seedDefault(
      'x.trends.collectionEnabled',
      defaults.trendCollectionEnabled,
    );
    await this.seedDefault(
      'x.trends.kolRadarEnabled',
      defaults.kolRadarEnabled,
    );
    await this.seedDefault(
      'x.trends.kolRadarCollectionIntervalMs',
      defaults.kolRadarCollectionIntervalMs,
    );
    await this.seedDefault(
      'x.trends.kolAccounts',
      defaults.kolRadarAccounts,
    );
    await this.backfillKolAccounts(defaults.kolRadarAccounts);
  }

  async getXTrendCollectionConfig(): Promise<XTrendCollectionConfig> {
    const defaults = DEFAULT_X_TREND_COLLECTION_CONFIG;
    const [
      regionsConfig,
      limitConfig,
      intervalConfig,
      trendCollectionEnabledConfig,
      kolRadarEnabledConfig,
      kolRadarIntervalConfig,
      kolAccountsConfig,
    ] = await Promise.all([
      this.repository.findByKey('x.trends.regions'),
      this.repository.findByKey('x.trends.limit'),
      this.repository.findByKey('x.trends.collectionIntervalMs'),
      this.repository.findByKey('x.trends.collectionEnabled'),
      this.repository.findByKey('x.trends.kolRadarEnabled'),
      this.repository.findByKey('x.trends.kolRadarCollectionIntervalMs'),
      this.repository.findByKey('x.trends.kolAccounts'),
    ]);

    return {
      regions: normalizeRegions(regionsConfig?.value, defaults.regions),
      limit: normalizePositiveNumber(limitConfig?.value, defaults.limit),
      collectionIntervalMs: normalizePositiveNumber(
        intervalConfig?.value,
        defaults.collectionIntervalMs,
      ),
      trendCollectionEnabled: normalizeBoolean(
        trendCollectionEnabledConfig?.value,
        defaults.trendCollectionEnabled,
      ),
      kolRadarEnabled: normalizeBoolean(
        kolRadarEnabledConfig?.value,
        defaults.kolRadarEnabled,
      ),
      kolRadarCollectionIntervalMs: normalizePositiveNumber(
        kolRadarIntervalConfig?.value,
        defaults.kolRadarCollectionIntervalMs,
      ),
      kolRadarAccounts: normalizeKolAccounts(
        kolAccountsConfig?.value,
        defaults.kolRadarAccounts,
      ),
    };
  }

  async updateXTrendCollectionConfig(
    patch: Partial<XTrendCollectionConfig>,
    updatedBy = 'system',
  ): Promise<XTrendCollectionConfig> {
    if (patch.regions) {
      await this.repository.upsert({
        key: 'x.trends.regions',
        value: normalizeRegions(patch.regions, DEFAULT_X_TREND_COLLECTION_CONFIG.regions),
        description: PROJECT_CONFIG_DESCRIPTIONS['x.trends.regions'],
        updatedBy,
      });
    }

    if (typeof patch.limit === 'number') {
      await this.repository.upsert({
        key: 'x.trends.limit',
        value: normalizePositiveNumber(
          patch.limit,
          DEFAULT_X_TREND_COLLECTION_CONFIG.limit,
        ),
        description: PROJECT_CONFIG_DESCRIPTIONS['x.trends.limit'],
        updatedBy,
      });
    }

    if (typeof patch.collectionIntervalMs === 'number') {
      await this.repository.upsert({
        key: 'x.trends.collectionIntervalMs',
        value: normalizePositiveNumber(
          patch.collectionIntervalMs,
          DEFAULT_X_TREND_COLLECTION_CONFIG.collectionIntervalMs,
        ),
        description: PROJECT_CONFIG_DESCRIPTIONS['x.trends.collectionIntervalMs'],
        updatedBy,
      });
    }

    if (typeof patch.trendCollectionEnabled === 'boolean') {
      await this.repository.upsert({
        key: 'x.trends.collectionEnabled',
        value: patch.trendCollectionEnabled,
        description: PROJECT_CONFIG_DESCRIPTIONS['x.trends.collectionEnabled'],
        updatedBy,
      });
    }

    if (typeof patch.kolRadarEnabled === 'boolean') {
      await this.repository.upsert({
        key: 'x.trends.kolRadarEnabled',
        value: patch.kolRadarEnabled,
        description: PROJECT_CONFIG_DESCRIPTIONS['x.trends.kolRadarEnabled'],
        updatedBy,
      });
    }

    if (typeof patch.kolRadarCollectionIntervalMs === 'number') {
      await this.repository.upsert({
        key: 'x.trends.kolRadarCollectionIntervalMs',
        value: normalizePositiveNumber(
          patch.kolRadarCollectionIntervalMs,
          DEFAULT_X_TREND_COLLECTION_CONFIG.kolRadarCollectionIntervalMs,
        ),
        description:
          PROJECT_CONFIG_DESCRIPTIONS['x.trends.kolRadarCollectionIntervalMs'],
        updatedBy,
      });
    }

    if (patch.kolRadarAccounts) {
      await this.repository.upsert({
        key: 'x.trends.kolAccounts',
        value: normalizeKolAccounts(
          patch.kolRadarAccounts,
          DEFAULT_X_TREND_COLLECTION_CONFIG.kolRadarAccounts,
        ),
        description: PROJECT_CONFIG_DESCRIPTIONS['x.trends.kolAccounts'],
        updatedBy,
      });
    }

    return this.getXTrendCollectionConfig();
  }

  list() {
    return this.repository.list();
  }

  private async seedDefault(key: string, value: JsonValue) {
    const existing = await this.repository.findByKey(key);

    if (existing) {
      return;
    }

    await this.repository.upsert({
      key,
      value,
      description: PROJECT_CONFIG_DESCRIPTIONS[key],
      updatedBy: 'system',
    });
  }

  private async backfillKolAccounts(defaultAccounts: KolRadarAccountConfig[]) {
    const existing = await this.repository.findByKey('x.trends.kolAccounts');
    if (!existing) return;

    const merged = mergeKolAccounts(existing.value, defaultAccounts);
    if (!merged) return;

    await this.repository.upsert({
      key: 'x.trends.kolAccounts',
      value: merged,
      description: PROJECT_CONFIG_DESCRIPTIONS['x.trends.kolAccounts'],
      updatedBy: 'system',
    });
  }
}

function normalizeRegions(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const regions = value
    .filter((region): region is string => typeof region === 'string')
    .map((region) => region.trim())
    .filter(Boolean);

  return regions.length > 0 ? regions : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
  }

  return fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  return fallback;
}

function normalizeKolAccounts(
  value: unknown,
  fallback: KolRadarAccountConfig[],
): KolRadarAccountConfig[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const fallbackByHandle = new Map(
    fallback.map((item) => [normalizeHandle(item.handle), item]),
  );
  const seen = new Set<string>();
  const accounts: KolRadarAccountConfig[] = [];

  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const handle = normalizeHandle(item.handle);
    if (!handle || seen.has(handle)) continue;

    const fallbackItem = fallbackByHandle.get(handle);
    const joinedAt = normalizeDateString(item.joinedAt, fallbackItem?.joinedAt);
    if (!joinedAt) continue;

    accounts.push({
      handle,
      groupTag: normalizeOptionalString(item.groupTag),
      joinedAt,
      enabled: normalizeBoolean(
        item.enabled,
        fallbackItem?.enabled ?? true,
      ),
    });
    seen.add(handle);
  }

  return accounts.length > 0 ? accounts : fallback;
}

function mergeKolAccounts(
  value: unknown,
  fallback: KolRadarAccountConfig[],
): KolRadarAccountConfig[] | null {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalizedExisting = normalizeKolAccounts(value, fallback);
  const existingByHandle = new Map(
    normalizedExisting.map((item) => [normalizeHandle(item.handle), item]),
  );
  const merged: KolRadarAccountConfig[] = [...normalizedExisting];

  for (const item of fallback) {
    const handle = normalizeHandle(item.handle);
    if (!handle || existingByHandle.has(handle)) continue;
    merged.push(item);
  }

  return merged.length === normalizedExisting.length ? null : merged;
}

function normalizeHandle(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/^@/, '') : '';
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next ? next : null;
}

function normalizeDateString(value: unknown, fallback?: string): string | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return fallback ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

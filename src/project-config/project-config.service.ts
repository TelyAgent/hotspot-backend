import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_X_TREND_COLLECTION_CONFIG,
  PROJECT_CONFIG_DESCRIPTIONS,
} from './project-config.defaults';
import { ProjectConfigRepository } from './project-config.repository';
import { XTrendCollectionConfig } from './project-config.types';

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
      'topicWatch.schedulerEnabled',
      defaults.topicWatchSchedulerEnabled,
    );
  }

  async getXTrendCollectionConfig(): Promise<XTrendCollectionConfig> {
    const defaults = DEFAULT_X_TREND_COLLECTION_CONFIG;
    const [
      regionsConfig,
      limitConfig,
      intervalConfig,
      trendCollectionEnabledConfig,
      topicWatchSchedulerEnabledConfig,
    ] = await Promise.all([
      this.repository.findByKey('x.trends.regions'),
      this.repository.findByKey('x.trends.limit'),
      this.repository.findByKey('x.trends.collectionIntervalMs'),
      this.repository.findByKey('x.trends.collectionEnabled'),
      this.repository.findByKey('topicWatch.schedulerEnabled'),
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
      topicWatchSchedulerEnabled: normalizeBoolean(
        topicWatchSchedulerEnabledConfig?.value,
        defaults.topicWatchSchedulerEnabled,
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

    if (typeof patch.topicWatchSchedulerEnabled === 'boolean') {
      await this.repository.upsert({
        key: 'topicWatch.schedulerEnabled',
        value: patch.topicWatchSchedulerEnabled,
        description: PROJECT_CONFIG_DESCRIPTIONS['topicWatch.schedulerEnabled'],
        updatedBy,
      });
    }

    return this.getXTrendCollectionConfig();
  }

  list() {
    return this.repository.list();
  }

  private async seedDefault(key: string, value: string[] | number | boolean) {
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

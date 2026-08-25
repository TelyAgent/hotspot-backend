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
  }

  async getXTrendCollectionConfig(): Promise<XTrendCollectionConfig> {
    const defaults = DEFAULT_X_TREND_COLLECTION_CONFIG;
    const [regionsConfig, limitConfig, intervalConfig] = await Promise.all([
      this.repository.findByKey('x.trends.regions'),
      this.repository.findByKey('x.trends.limit'),
      this.repository.findByKey('x.trends.collectionIntervalMs'),
    ]);

    return {
      regions: normalizeRegions(regionsConfig?.value, defaults.regions),
      limit: normalizePositiveNumber(limitConfig?.value, defaults.limit),
      collectionIntervalMs: normalizePositiveNumber(
        intervalConfig?.value,
        defaults.collectionIntervalMs,
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

    return this.getXTrendCollectionConfig();
  }

  list() {
    return this.repository.list();
  }

  private async seedDefault(key: string, value: string[] | number) {
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

import { XTrendCollectionConfig } from './project-config.types';

export const DEFAULT_X_TREND_COLLECTION_CONFIG: XTrendCollectionConfig = {
  regions: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
  limit: 30,
  collectionIntervalMs: 3 * 60 * 60 * 1000,
  trendCollectionEnabled: true,
  topicWatchSchedulerEnabled: true,
};

export const PROJECT_CONFIG_DESCRIPTIONS: Record<string, string> = {
  'x.trends.regions': 'X 热榜采集地区列表。',
  'x.trends.limit': '每个地区采集的 X 热榜条数。',
  'x.trends.collectionIntervalMs': 'X 热榜自动采集间隔，单位毫秒。',
  'x.trends.collectionEnabled': '是否启用 X 热榜自动采集。',
  'topicWatch.schedulerEnabled': '是否启用重点主题追踪自动采集。',
};

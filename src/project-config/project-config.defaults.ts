import { XTrendCollectionConfig } from './project-config.types';

export const DEFAULT_X_TREND_COLLECTION_CONFIG: XTrendCollectionConfig = {
  regions: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
  limit: 30,
  collectionIntervalMs: 3 * 60 * 60 * 1000,
  trendCollectionEnabled: true,
  kolRadarEnabled: true,
  kolRadarCollectionIntervalMs: 6 * 60 * 60 * 1000,
  kolRadarAccounts: [
    {
      handle: 'OpenAI',
      groupTag: 'AI / 产品',
      joinedAt: '2026-08-26T06:33:01.015Z',
      enabled: true,
    },
    {
      handle: 'AnthropicAI',
      groupTag: 'AI / 产品',
      joinedAt: '2026-08-26T06:33:01.021Z',
      enabled: true,
    },
    {
      handle: 'GoogleDeepMind',
      groupTag: 'AI / 研究',
      joinedAt: '2026-08-26T06:33:01.024Z',
      enabled: true,
    },
    {
      handle: 'Polymarket',
      groupTag: '预测市场',
      joinedAt: '2026-08-26T06:33:01.077Z',
      enabled: true,
    },
    {
      handle: 'BLS_gov',
      groupTag: '宏观数据',
      joinedAt: '2026-08-26T06:33:01.062Z',
      enabled: true,
    },
  ],
};

export const PROJECT_CONFIG_DESCRIPTIONS: Record<string, string> = {
  'x.trends.regions': 'X 热榜采集地区列表。',
  'x.trends.limit': '每个地区采集的 X 热榜条数。',
  'x.trends.collectionIntervalMs': 'X 热榜自动采集间隔，单位毫秒。',
  'x.trends.collectionEnabled': '是否启用 X 热榜自动采集。',
  'x.trends.kolRadarEnabled': '是否启用 KOL 人驱动热点雷达。',
  'x.trends.kolRadarCollectionIntervalMs': 'KOL 热点雷达自动采集间隔，单位毫秒。',
  'x.trends.kolAccounts': 'KOL 热点雷达账号列表。',
};

/**
 * twitterapi.io `/user/info` 的 location 是自由文本（如 "San Francisco, CA"）。
 * 这个模块把它映射到前端现有 REGION_OPTIONS（美国/英国/日本/韩国/新加坡/未知）。
 * 关键词覆盖了常见写法（英文城市/州/国家），未命中归"未知"并标记 regionSource='auto'。
 */
const REGION_RULES: Array<{ region: string; patterns: string[] }> = [
  {
    region: '美国',
    patterns: [
      'united states',
      'usa',
      'us',
      'america',
      'san francisco',
      'new york',
      'los angeles',
      'seattle',
      'austin',
      'chicago',
      'boston',
      'miami',
      'washington',
      'silicon valley',
      'california',
      'texas',
    ],
  },
  {
    region: '英国',
    patterns: ['united kingdom', ' uk', 'london', 'england', 'scotland', 'wales', 'manchester'],
  },
  {
    region: '日本',
    patterns: ['japan', 'tokyo', 'osaka', 'kyoto', '日本', '東京', '大阪'],
  },
  {
    region: '韩国',
    patterns: ['korea', 'seoul', '韩国', '서울'],
  },
  {
    region: '新加坡',
    patterns: ['singapore', '新加坡'],
  },
];

export const REGION_FALLBACK = '未知';

/** 命中关键词时返回区域；空串或未识别时返回 REGION_FALLBACK。 */
export function resolveRegionFromLocation(location: string | null | undefined): string {
  const normalized = (location ?? '').trim().toLowerCase();
  if (!normalized) {
    return REGION_FALLBACK;
  }

  for (const rule of REGION_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(pattern))) {
      return rule.region;
    }
  }

  return REGION_FALLBACK;
}

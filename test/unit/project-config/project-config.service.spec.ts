import { ProjectConfigRepository } from '../../../src/project-config/project-config.repository';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';

describe('ProjectConfigService', () => {
  it('returns default X trend collection config when values are not stored yet', async () => {
    const repository = {
      findByKey: jest.fn(() => null),
      upsert: jest.fn(),
    } as unknown as ProjectConfigRepository;
    const service = new ProjectConfigService(repository);

    await expect(service.getXTrendCollectionConfig()).resolves.toEqual({
      regions: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
      limit: 30,
      collectionIntervalMs: 10800000,
      trendCollectionEnabled: true,
      kolRadarEnabled: true,
      kolRadarCollectionIntervalMs: 21600000,
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
    });
  });

  it('merges stored X trend collection config with defaults', async () => {
    const repository = {
      findByKey: jest.fn((key: string) => {
        if (key === 'x.trends.regions') {
          return { key, value: ['Japan'] };
        }
        if (key === 'x.trends.limit') {
          return { key, value: 10 };
        }
        return null;
      }),
      upsert: jest.fn(),
    } as unknown as ProjectConfigRepository;
    const service = new ProjectConfigService(repository);

    await expect(service.getXTrendCollectionConfig()).resolves.toEqual({
      regions: ['Japan'],
      limit: 10,
      collectionIntervalMs: 10800000,
      trendCollectionEnabled: true,
      kolRadarEnabled: true,
      kolRadarCollectionIntervalMs: 21600000,
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
    });
  });
});

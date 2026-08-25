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
      collectionIntervalMs: 7200000,
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
      collectionIntervalMs: 7200000,
    });
  });
});

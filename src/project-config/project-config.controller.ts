import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ProjectConfigService } from './project-config.service';
import { XTrendCollectionConfig } from './project-config.types';

@Controller('project-config')
export class ProjectConfigController {
  constructor(private readonly projectConfigService: ProjectConfigService) {}

  @Get()
  list() {
    return this.projectConfigService.list();
  }

  @Get('x-trends')
  getXTrendCollectionConfig() {
    return this.projectConfigService.getXTrendCollectionConfig();
  }

  @Patch('x-trends')
  updateXTrendCollectionConfig(
    @Body() body: Partial<XTrendCollectionConfig>,
  ) {
    return this.projectConfigService.updateXTrendCollectionConfig(
      {
        regions: Array.isArray(body.regions) ? body.regions.map(String) : undefined,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
        collectionIntervalMs:
          typeof body.collectionIntervalMs === 'number'
            ? body.collectionIntervalMs
            : undefined,
        trendCollectionEnabled:
          typeof body.trendCollectionEnabled === 'boolean'
            ? body.trendCollectionEnabled
            : undefined,
        kolRadarEnabled:
          typeof body.kolRadarEnabled === 'boolean'
            ? body.kolRadarEnabled
            : undefined,
        kolRadarCollectionIntervalMs:
          typeof body.kolRadarCollectionIntervalMs === 'number'
            ? body.kolRadarCollectionIntervalMs
            : undefined,
        kolRadarMinViews:
          typeof body.kolRadarMinViews === 'number'
            ? body.kolRadarMinViews
            : undefined,
        kolRadarAccounts: Array.isArray(body.kolRadarAccounts)
          ? body.kolRadarAccounts.map((item) => ({
              handle: String(item?.handle ?? ''),
              groupTag:
                typeof item?.groupTag === 'string' ? item.groupTag : null,
              joinedAt: String(item?.joinedAt ?? ''),
              enabled: Boolean(item?.enabled),
            }))
          : undefined,
      },
      'api',
    );
  }
}

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
        topicWatchSchedulerEnabled:
          typeof body.topicWatchSchedulerEnabled === 'boolean'
            ? body.topicWatchSchedulerEnabled
            : undefined,
      },
      'api',
    );
  }
}

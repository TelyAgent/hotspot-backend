import { Module } from '@nestjs/common';
import { ProjectConfigModule } from '../project-config/project-config.module';
import { SignalModule } from '../signal/signal.module';
import { DataSourceController } from './data-source.controller';
import { MockDataSourcePlugin } from './plugins/mock/mock.plugin';
import { XTrendsPlugin } from './plugins/x-trends/x-trends.plugin';
import { DataSourcePluginRegistrationService } from './registry/data-source-plugin-registration.service';
import { DataSourcePluginRegistry } from './registry/data-source-plugin.registry';
import { CollectionRunRepository } from './runner/collection-run.repository';
import { CollectionRunnerService } from './runner/collection-runner.service';
import { DataSourceSchedulerService } from './scheduler/data-source-scheduler.service';

@Module({
  imports: [SignalModule, ProjectConfigModule],
  controllers: [DataSourceController],
  providers: [
    MockDataSourcePlugin,
    XTrendsPlugin,
    DataSourcePluginRegistry,
    DataSourcePluginRegistrationService,
    CollectionRunRepository,
    CollectionRunnerService,
    DataSourceSchedulerService,
  ],
  exports: [DataSourcePluginRegistry, CollectionRunnerService],
})
export class DataSourceModule {}

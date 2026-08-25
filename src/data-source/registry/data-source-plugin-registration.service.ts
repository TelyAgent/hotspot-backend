import { Injectable, OnModuleInit } from '@nestjs/common';
import { MockDataSourcePlugin } from '../plugins/mock/mock.plugin';
import { XTrendsPlugin } from '../plugins/x-trends/x-trends.plugin';
import { DataSourcePluginRegistry } from './data-source-plugin.registry';

@Injectable()
export class DataSourcePluginRegistrationService implements OnModuleInit {
  constructor(
    private readonly registry: DataSourcePluginRegistry,
    private readonly mockPlugin: MockDataSourcePlugin,
    private readonly xTrendsPlugin: XTrendsPlugin,
  ) {}

  onModuleInit(): void {
    for (const plugin of [this.mockPlugin, this.xTrendsPlugin]) {
      this.registry.register(plugin);
    }
  }
}

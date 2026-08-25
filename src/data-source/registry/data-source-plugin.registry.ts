import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { DataSourcePlugin } from '../plugins/data-source-plugin.interface';

@Injectable()
export class DataSourcePluginRegistry {
  private readonly plugins = new Map<string, DataSourcePlugin>();

  register(plugin: DataSourcePlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new DomainError(
        `Data source plugin already registered: ${plugin.id}`,
        'DATA_SOURCE_PLUGIN_DUPLICATED',
        {
          pluginId: plugin.id,
        },
      );
    }

    this.plugins.set(plugin.id, plugin);
  }

  get(pluginId: string): DataSourcePlugin {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      throw new DomainError(
        `Data source plugin not found: ${pluginId}`,
        'DATA_SOURCE_PLUGIN_NOT_FOUND',
        {
          pluginId,
        },
      );
    }

    return plugin;
  }

  list(): DataSourcePlugin[] {
    return [...this.plugins.values()];
  }
}

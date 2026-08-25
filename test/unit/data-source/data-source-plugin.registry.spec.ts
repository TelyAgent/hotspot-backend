import { DomainError } from '../../../src/common/errors/domain-error';
import { DataSourcePluginRegistry } from '../../../src/data-source/registry/data-source-plugin.registry';
import { MockDataSourcePlugin } from '../../../src/data-source/plugins/mock/mock.plugin';

describe('DataSourcePluginRegistry', () => {
  it('registers and returns a plugin', () => {
    const registry = new DataSourcePluginRegistry();
    const plugin = new MockDataSourcePlugin();

    registry.register(plugin);

    expect(registry.get('mock')).toBe(plugin);
    expect(registry.list()).toEqual([plugin]);
  });

  it('rejects duplicated plugin ids', () => {
    const registry = new DataSourcePluginRegistry();

    registry.register(new MockDataSourcePlugin());

    expect(() => registry.register(new MockDataSourcePlugin())).toThrow(
      DomainError,
    );
  });

  it('throws a domain error when a plugin is missing', () => {
    const registry = new DataSourcePluginRegistry();

    expect(() => registry.get('missing')).toThrow(
      expect.objectContaining({
        code: 'DATA_SOURCE_PLUGIN_NOT_FOUND',
      }),
    );
  });
});

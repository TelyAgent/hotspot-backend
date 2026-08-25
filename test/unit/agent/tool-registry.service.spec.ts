import { DomainError } from '../../../src/common/errors/domain-error';
import { AgentToolDefinition } from '../../../src/agent/tool-registry/agent-tool.interface';
import { ToolRegistryService } from '../../../src/agent/tool-registry/tool-registry.service';

const testTool: AgentToolDefinition = {
  name: 'signal.search',
  description: 'Search signals.',
  permission: 'read',
  fieldSelection: {
    supported: true,
    allowedFields: ['id', 'title'],
    defaultFields: ['id'],
  },
  execute: jest.fn(),
};

describe('ToolRegistryService', () => {
  it('registers and returns a tool', () => {
    const registry = new ToolRegistryService();

    registry.register(testTool);

    expect(registry.get('signal.search')).toBe(testTool);
    expect(registry.list()).toEqual([testTool]);
  });

  it('rejects duplicated tool names', () => {
    const registry = new ToolRegistryService();

    registry.register(testTool);

    expect(() => registry.register(testTool)).toThrow(DomainError);
  });

  it('throws a domain error when a tool is missing', () => {
    const registry = new ToolRegistryService();

    expect(() => registry.get('missing.tool')).toThrow(
      expect.objectContaining({
        code: 'AGENT_TOOL_NOT_FOUND',
      }),
    );
  });
});

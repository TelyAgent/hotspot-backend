import { Injectable, NotFoundException } from '@nestjs/common';
import { McpTool, McpToolDefinition } from './mcp.types';

@Injectable()
export class McpToolRegistryService {
  private readonly tools = new Map<string, McpTool>();

  register(tool: McpTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  listTools(): McpToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.definition);
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException('未找到指定 MCP 工具。');
    }

    return tool.call(args);
  }
}

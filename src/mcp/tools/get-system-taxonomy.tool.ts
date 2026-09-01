import { Injectable, OnModuleInit } from '@nestjs/common';
import { McpTaxonomyService } from '../mcp-taxonomy.service';
import { McpTool, McpToolDefinition } from '../mcp.types';
import { McpToolRegistryService } from '../mcp-tool-registry.service';

@Injectable()
export class GetSystemTaxonomyTool implements McpTool, OnModuleInit {
  readonly definition: McpToolDefinition = {
    name: 'get_system_taxonomy',
    description: '获取热点系统的数据语义、固定领域、固定来源与热度标签，帮助外部 Agent 理解查询结果。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  };

  constructor(
    private readonly registry: McpToolRegistryService,
    private readonly taxonomyService: McpTaxonomyService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  call() {
    return this.taxonomyService.getTaxonomy();
  }
}

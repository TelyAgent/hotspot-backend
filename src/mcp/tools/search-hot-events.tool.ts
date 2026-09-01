import { Injectable, OnModuleInit } from '@nestjs/common';
import { McpHotEventService } from '../mcp-hot-event.service';
import { McpSearchHotEventsInput, McpTool, McpToolDefinition } from '../mcp.types';
import { McpToolRegistryService } from '../mcp-tool-registry.service';

@Injectable()
export class SearchHotEventsTool implements McpTool, OnModuleInit {
  readonly definition: McpToolDefinition = {
    name: 'search_hot_events',
    description: '按关键词、领域、来源标签或热度标签查询热点事件列表，返回适合 Agent 使用的中文摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选关键词，匹配事件标题或摘要。' },
        domains: { type: 'array', items: { type: 'string' }, description: '可选事件领域，例如 AI、Prediction Markets。' },
        sources: { type: 'array', items: { type: 'string' }, description: '可选来源标签，例如 X Trend、Topic Circle、Future Event。' },
        labels: { type: 'array', items: { type: 'string' }, description: '可选任意固定标签，例如 Top5、Fast Rising、第一方确认。' },
        since: { type: 'string', description: '可选 ISO 时间，只返回此时间之后更新的事件。' },
        limit: { type: 'number', description: '返回条数，默认 20，最大 50。' },
      },
      additionalProperties: false,
    },
  };

  constructor(
    private readonly registry: McpToolRegistryService,
    private readonly eventService: McpHotEventService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  call(args: Record<string, unknown>) {
    return this.eventService.searchHotEvents(args as McpSearchHotEventsInput);
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { McpSignalService } from '../mcp-signal.service';
import { McpSearchSignalsInput, McpTool, McpToolDefinition } from '../mcp.types';
import { McpToolRegistryService } from '../mcp-tool-registry.service';

@Injectable()
export class SearchSignalsTool implements McpTool, OnModuleInit {
  readonly definition: McpToolDefinition = {
    name: 'search_signals',
    description: '查询进入热点系统的原始 Signal，适合外部 Agent 追溯信号来源、链接、发布时间和公开指标。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选关键词，匹配 Signal 标题或摘要。' },
        signalType: { type: 'string', description: '可选 Signal 类型，例如 x_trend、topic_watch_post、youtube_video。' },
        platform: { type: 'string', description: '可选平台，例如 x、youtube。' },
        since: { type: 'string', description: '可选 ISO 时间，只返回此时间之后观测到的信号。' },
        limit: { type: 'number', description: '返回条数，默认 20，最大 50。' },
      },
      additionalProperties: false,
    },
  };

  constructor(
    private readonly registry: McpToolRegistryService,
    private readonly signalService: McpSignalService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  call(args: Record<string, unknown>) {
    return this.signalService.searchSignals(args as McpSearchSignalsInput);
  }
}

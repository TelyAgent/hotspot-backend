import { Injectable, OnModuleInit } from '@nestjs/common';
import { McpHotEventService } from '../mcp-hot-event.service';
import { McpGetHotEventDetailInput, McpTool, McpToolDefinition } from '../mcp.types';
import { McpToolRegistryService } from '../mcp-tool-registry.service';

@Injectable()
export class GetHotEventDetailTool implements McpTool, OnModuleInit {
  readonly definition: McpToolDefinition = {
    name: 'get_hot_event_detail',
    description: '根据热点事件 ID 获取事件详情、证据链、时间线和适合大模型解析的完整中文上下文。',
    inputSchema: {
      type: 'object',
      required: ['eventId'],
      properties: {
        eventId: { type: 'string', description: '热点事件 ID。' },
        includeRawSignals: { type: 'boolean', description: '预留字段。第一阶段默认不返回原始裸数据。' },
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
    return this.eventService.getHotEventDetail(args as unknown as McpGetHotEventDetailInput);
  }
}

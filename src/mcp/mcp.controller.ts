import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpErrorResponseBody, McpJsonRpcRequest } from './mcp.types';

const SERVER_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);

interface McpHttpResponse {
  setHeader(name: string, value: string): void;
  status(code: number): void;
}

@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(private readonly registry: McpToolRegistryService) {}

  @Post()
  @HttpCode(200)
  async handle(@Body() body: McpJsonRpcRequest, @Res({ passthrough: true }) response: McpHttpResponse) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      if (body.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id: body.id ?? null,
          result: {
            protocolVersion: this.resolveProtocolVersion(body.params?.protocolVersion),
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: 'hotspot-agent-backend',
              title: 'Hotspot Agent MCP Server',
              version: process.env.npm_package_version ?? '0.1.0',
            },
            instructions:
              '这是热点情报系统的只读 MCP 服务。优先调用 get_system_taxonomy 理解数据语义，再调用 search_hot_events、get_hot_event_detail 或 search_signals 查询热点数据。',
          },
        };
      }

      if (body.method === 'notifications/initialized') {
        response.status(202);
        return undefined;
      }

      if (body.method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id: body.id ?? null,
          result: {
            tools: this.registry.listTools(),
          },
        };
      }

      if (body.method === 'tools/call') {
        const result = await this.registry.callTool(body.params?.name ?? '', body.params?.arguments ?? {});
        return {
          jsonrpc: '2.0',
          id: body.id ?? null,
          result: this.toToolCallResult(result),
        };
      }

      return this.error(body.id, {
        code: -32601,
        message: '当前 MCP endpoint 仅支持 tools/list 和 tools/call。',
        data: {
          code: 'MCP_METHOD_NOT_SUPPORTED',
          retryable: false,
          suggestion: '请使用 MCP tools/list 获取工具定义，再调用 tools/call。',
        },
      });
    } catch (error) {
      return this.error(body.id, this.toMcpError(error));
    }
  }

  private error(id: string | number | null | undefined, error: McpErrorResponseBody) {
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      error,
    };
  }

  private toMcpError(error: unknown): McpErrorResponseBody {
    if (error instanceof DomainError) {
      return {
        code: -32602,
        message: error.message,
        data: {
          code: error.code,
          retryable: false,
          details: error.details,
        },
      };
    }

    const status = typeof error === 'object' && error && 'getStatus' in error ? (error as { getStatus: () => number }).getStatus() : 500;
    if (status === 404) {
      return {
        code: -32602,
        message: '未找到指定 MCP 工具。',
        data: {
          code: 'MCP_TOOL_NOT_FOUND',
          retryable: false,
          suggestion: '请先调用 tools/list 获取可用工具名称。',
        },
      };
    }

    return {
      code: -32603,
      message: 'MCP 工具调用失败。',
      data: {
        code: 'MCP_INTERNAL_ERROR',
        retryable: true,
        suggestion: '请稍后重试；如果持续失败，请联系系统管理员查看后端日志。',
      },
    };
  }

  private resolveProtocolVersion(requested?: string) {
    return requested && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
      ? requested
      : SERVER_PROTOCOL_VERSION;
  }

  private toToolCallResult(data: unknown) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: {
        data,
      },
      isError: false,
    };
  }
}

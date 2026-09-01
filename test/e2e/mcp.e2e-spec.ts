import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { McpAuthGuard } from '../../src/mcp/mcp-auth.guard';
import { McpController } from '../../src/mcp/mcp.controller';
import { McpTaxonomyService } from '../../src/mcp/mcp-taxonomy.service';
import { McpToolRegistryService } from '../../src/mcp/mcp-tool-registry.service';
import { GetSystemTaxonomyTool } from '../../src/mcp/tools/get-system-taxonomy.tool';

describe('MCP API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.HOTSPOT_MCP_API_KEY = 'test-mcp-key';
    const moduleRef = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpAuthGuard,
        McpToolRegistryService,
        McpTaxonomyService,
        GetSystemTaxonomyTool,
        ConfigService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.HOTSPOT_MCP_API_KEY;
  });

  it('rejects unauthenticated MCP calls', async () => {
    await request(app.getHttpServer())
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(401);
  });

  it('returns the MCP tool list', async () => {
    const response = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', 'Bearer test-mcp-key')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(200);

    expect(response.body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'get_system_taxonomy',
          description: expect.any(String),
          inputSchema: expect.any(Object),
        }),
      ]),
    );
  });

  it('performs the MCP initialize handshake', async () => {
    const response = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', 'Bearer test-mcp-key')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'test-agent',
            version: '1.0.0',
          },
        },
      })
      .expect(200);

    expect(response.body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: expect.objectContaining({
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: 'hotspot-agent-backend',
          title: 'Hotspot Agent MCP Server',
          version: expect.any(String),
        },
        instructions: expect.any(String),
      }),
    });
  });

  it('returns standard MCP tool call content and structured content', async () => {
    const response = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', 'Bearer test-mcp-key')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_system_taxonomy', arguments: {} },
      })
      .expect(200);

    expect(response.body).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"domains"'),
          },
        ],
        structuredContent: {
          data: expect.objectContaining({
            eventDomains: expect.any(Array),
          }),
        },
        isError: false,
      },
    });
  });

  it('returns agent-readable error for unknown tools', async () => {
    const response = await request(app.getHttpServer())
      .post('/mcp')
      .set('Authorization', 'Bearer test-mcp-key')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'missing_tool', arguments: {} },
      })
      .expect(200);

    expect(response.body).toEqual({
      jsonrpc: '2.0',
      id: 2,
      error: {
        code: -32602,
        message: '未找到指定 MCP 工具。',
        data: {
          code: 'MCP_TOOL_NOT_FOUND',
          retryable: false,
          suggestion: '请先调用 tools/list 获取可用工具名称。',
        },
      },
    });
  });
});

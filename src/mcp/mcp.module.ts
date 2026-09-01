import { Module } from '@nestjs/common';
import { OpportunityModule } from '../opportunity/opportunity.module';
import { SignalModule } from '../signal/signal.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpHotEventService } from './mcp-hot-event.service';
import { McpSignalService } from './mcp-signal.service';
import { McpTaxonomyService } from './mcp-taxonomy.service';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { GetHotEventDetailTool } from './tools/get-hot-event-detail.tool';
import { GetSystemTaxonomyTool } from './tools/get-system-taxonomy.tool';
import { SearchHotEventsTool } from './tools/search-hot-events.tool';
import { SearchSignalsTool } from './tools/search-signals.tool';

@Module({
  imports: [OpportunityModule, SignalModule],
  controllers: [McpController],
  providers: [
    McpAuthGuard,
    McpToolRegistryService,
    McpTaxonomyService,
    McpHotEventService,
    McpSignalService,
    GetSystemTaxonomyTool,
    SearchHotEventsTool,
    GetHotEventDetailTool,
    SearchSignalsTool,
  ],
})
export class McpModule {}

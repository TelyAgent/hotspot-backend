import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { ContentController } from './content.controller';
import { ContentDraftRepository } from './draft/content-draft.repository';
import { ContentGenerationAgentService } from './generation/content-generation-agent.service';
import { HotspotOperationService } from './hotspot-operation/hotspot-operation.service';

@Module({
  imports: [AgentModule],
  controllers: [ContentController],
  providers: [
    ContentDraftRepository,
    ContentGenerationAgentService,
    HotspotOperationService,
  ],
  exports: [
    ContentDraftRepository,
    ContentGenerationAgentService,
    HotspotOperationService,
  ],
})
export class ContentModule {}

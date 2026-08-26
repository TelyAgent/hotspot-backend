import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { EventMergeController } from './event-merge.controller';
import { EventMergeAgentService } from './event-merge-agent.service';
import { EventMergeOrchestratorService } from './event-merge-orchestrator.service';
import { EventMergeRepository } from './event-merge.repository';

@Module({
  imports: [AgentModule],
  controllers: [EventMergeController],
  providers: [
    EventMergeRepository,
    EventMergeAgentService,
    EventMergeOrchestratorService,
  ],
  exports: [
    EventMergeRepository,
    EventMergeAgentService,
    EventMergeOrchestratorService,
  ],
})
export class EventMergeModule {}

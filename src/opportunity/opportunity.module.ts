import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { OpportunityMiningAgentService } from './mining/opportunity-mining-agent.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityRepository } from './opportunity.repository';

@Module({
  imports: [AgentModule],
  controllers: [OpportunityController],
  providers: [OpportunityRepository, OpportunityMiningAgentService],
  exports: [OpportunityRepository, OpportunityMiningAgentService],
})
export class OpportunityModule {}

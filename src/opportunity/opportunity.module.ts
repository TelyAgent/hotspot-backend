import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { OpportunityMiningDecisionValidator } from './mining/opportunity-mining-decision.validator';
import { OpportunityMiningEvidenceService } from './mining/opportunity-mining-evidence.service';
import { OpportunityMiningAgentService } from './mining/opportunity-mining-agent.service';
import { OpportunityMiningOrchestratorService } from './mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningSchedulerService } from './mining/opportunity-mining-scheduler.service';
import { OpportunityMiningSignalSelectorService } from './mining/opportunity-mining-signal-selector.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityRepository } from './opportunity.repository';
import { EventLabelingService } from './labeling/event-labeling.service';
import { OpportunityRulePackGovernanceService } from './rule-pack/opportunity-rule-pack-governance.service';
import { OpportunityRulePackLoaderService } from './rule-pack/opportunity-rule-pack-loader.service';

@Module({
  imports: [AgentModule],
  controllers: [OpportunityController],
  providers: [
    OpportunityRepository,
    OpportunityMiningAgentService,
    OpportunityMiningDecisionValidator,
    OpportunityMiningEvidenceService,
    OpportunityMiningOrchestratorService,
    OpportunityMiningSchedulerService,
    OpportunityMiningSignalSelectorService,
    EventLabelingService,
    OpportunityRulePackGovernanceService,
    OpportunityRulePackLoaderService,
  ],
  exports: [
    OpportunityRepository,
    OpportunityMiningAgentService,
    OpportunityMiningOrchestratorService,
    OpportunityMiningSignalSelectorService,
    EventLabelingService,
    OpportunityRulePackGovernanceService,
    OpportunityRulePackLoaderService,
  ],
})
export class OpportunityModule {}

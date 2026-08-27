import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { EventMergeModule } from '../event-merge/event-merge.module';
import { SignalEvidenceEnrichmentModule } from '../signal/enrichment/signal-evidence-enrichment.module';
import { OpportunityMiningDecisionValidator } from './mining/opportunity-mining-decision.validator';
import { OpportunityMiningEvidenceService } from './mining/opportunity-mining-evidence.service';
import { OpportunityMiningAgentService } from './mining/opportunity-mining-agent.service';
import { OpportunityMiningOrchestratorService } from './mining/opportunity-mining-orchestrator.service';
import { OpportunityMiningSchedulerService } from './mining/opportunity-mining-scheduler.service';
import { OpportunityMiningSignalSelectorService } from './mining/opportunity-mining-signal-selector.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityRepository } from './opportunity.repository';
import { EventLabelingService } from './labeling/event-labeling.service';
import { EventDomainLabelService } from './labeling/event-domain-label.service';
import { OpportunityRulePackGovernanceService } from './rule-pack/opportunity-rule-pack-governance.service';
import { OpportunityRulePackLoaderService } from './rule-pack/opportunity-rule-pack-loader.service';
import { EventTriggerReasonService } from './trigger-reason/event-trigger-reason.service';

@Module({
  imports: [AgentModule, EventMergeModule, SignalEvidenceEnrichmentModule],
  controllers: [OpportunityController],
  providers: [
    OpportunityRepository,
    OpportunityMiningAgentService,
    OpportunityMiningDecisionValidator,
    OpportunityMiningEvidenceService,
    OpportunityMiningOrchestratorService,
    OpportunityMiningSchedulerService,
    OpportunityMiningSignalSelectorService,
    EventDomainLabelService,
    EventLabelingService,
    EventTriggerReasonService,
    OpportunityRulePackGovernanceService,
    OpportunityRulePackLoaderService,
  ],
  exports: [
    OpportunityRepository,
    OpportunityMiningAgentService,
    OpportunityMiningOrchestratorService,
    OpportunityMiningSignalSelectorService,
    EventDomainLabelService,
    EventLabelingService,
    EventTriggerReasonService,
    OpportunityRulePackGovernanceService,
    OpportunityRulePackLoaderService,
  ],
})
export class OpportunityModule {}

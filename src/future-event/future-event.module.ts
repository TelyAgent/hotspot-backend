import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { DataSourceModule } from '../data-source/data-source.module';
import { FutureEventCandidateService } from './candidate/future-event-candidate.service';
import { FutureEventDiscoveryAgentService } from './discovery/future-event-discovery-agent.service';
import { FutureEventController } from './future-event.controller';
import { FutureEventRepository } from './future-event.repository';
import { FutureEventMonitoringAgentService } from './monitoring/future-event-monitoring-agent.service';
import { FutureEventMonitoringExecutionService } from './monitoring/future-event-monitoring-execution.service';
import { FutureEventMonitoringPlanService } from './monitoring/future-event-monitoring-plan.service';
import { FutureEventMonitoringSchedulerService } from './monitoring/future-event-monitoring-scheduler.service';
import { FutureEventActionScoreService } from './score/future-event-action-score.service';
import { FutureEventSourceDiscoveryAgentService } from './source/future-event-source-discovery-agent.service';
import { FutureEventSourceSchedulerService } from './source/future-event-source-scheduler.service';
import { FutureEventSourceService } from './source/future-event-source.service';
import { FutureEventSourceStrategyService } from './source/future-event-source-strategy.service';

@Module({
  imports: [AgentModule, DataSourceModule],
  controllers: [FutureEventController],
  providers: [
    FutureEventRepository,
    FutureEventCandidateService,
    FutureEventDiscoveryAgentService,
    FutureEventMonitoringAgentService,
    FutureEventMonitoringExecutionService,
    FutureEventMonitoringPlanService,
    FutureEventActionScoreService,
    FutureEventMonitoringSchedulerService,
    FutureEventSourceDiscoveryAgentService,
    FutureEventSourceService,
    FutureEventSourceStrategyService,
    FutureEventSourceSchedulerService,
  ],
  exports: [
    FutureEventRepository,
    FutureEventCandidateService,
    FutureEventDiscoveryAgentService,
    FutureEventMonitoringAgentService,
    FutureEventMonitoringExecutionService,
    FutureEventMonitoringPlanService,
    FutureEventActionScoreService,
    FutureEventSourceDiscoveryAgentService,
    FutureEventSourceService,
    FutureEventSourceStrategyService,
  ],
})
export class FutureEventModule {}

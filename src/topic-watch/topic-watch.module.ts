import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { DataSourceModule } from '../data-source/data-source.module';
import { TopicAggregationService } from './aggregation/topic-aggregation.service';
import { TopicCandidateDetailService } from './candidate-detail/topic-candidate-detail.service';
import { TopicWatchCollectionService } from './collection/topic-watch-collection.service';
import { TopicWatchAgentService } from './decision/topic-watch-agent.service';
import { TopicWatchDefaultsService } from './defaults/topic-watch-defaults.service';
import { TopicMonitoringPlanService } from './monitoring-plan/topic-monitoring-plan.service';
import { TopicWatchSchedulerService } from './scheduler/topic-watch-scheduler.service';
import { TopicWatchController } from './topic-watch.controller';
import { TopicWatchRepository } from './topic-watch.repository';

@Module({
  imports: [AgentModule, DataSourceModule],
  controllers: [TopicWatchController],
  providers: [
    TopicWatchRepository,
    TopicWatchCollectionService,
    TopicWatchDefaultsService,
    TopicWatchSchedulerService,
    TopicAggregationService,
    TopicCandidateDetailService,
    TopicMonitoringPlanService,
    TopicWatchAgentService,
  ],
  exports: [
    TopicWatchRepository,
    TopicWatchCollectionService,
    TopicWatchDefaultsService,
    TopicWatchSchedulerService,
    TopicAggregationService,
    TopicCandidateDetailService,
    TopicMonitoringPlanService,
    TopicWatchAgentService,
  ],
})
export class TopicWatchModule {}

import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { TopicAggregationService } from './aggregation/topic-aggregation.service';
import { TopicWatchAgentService } from './decision/topic-watch-agent.service';
import { TopicMonitoringPlanService } from './monitoring-plan/topic-monitoring-plan.service';
import { TopicWatchController } from './topic-watch.controller';
import { TopicWatchRepository } from './topic-watch.repository';

@Module({
  imports: [AgentModule],
  controllers: [TopicWatchController],
  providers: [
    TopicWatchRepository,
    TopicAggregationService,
    TopicMonitoringPlanService,
    TopicWatchAgentService,
  ],
  exports: [
    TopicWatchRepository,
    TopicAggregationService,
    TopicMonitoringPlanService,
    TopicWatchAgentService,
  ],
})
export class TopicWatchModule {}

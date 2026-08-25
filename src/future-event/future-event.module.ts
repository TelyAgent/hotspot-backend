import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { FutureEventDiscoveryAgentService } from './discovery/future-event-discovery-agent.service';
import { FutureEventController } from './future-event.controller';
import { FutureEventRepository } from './future-event.repository';
import { FutureEventMonitoringAgentService } from './monitoring/future-event-monitoring-agent.service';
import { FutureEventMonitoringPlanService } from './monitoring/future-event-monitoring-plan.service';

@Module({
  imports: [AgentModule],
  controllers: [FutureEventController],
  providers: [
    FutureEventRepository,
    FutureEventDiscoveryAgentService,
    FutureEventMonitoringAgentService,
    FutureEventMonitoringPlanService,
  ],
  exports: [
    FutureEventRepository,
    FutureEventDiscoveryAgentService,
    FutureEventMonitoringAgentService,
    FutureEventMonitoringPlanService,
  ],
})
export class FutureEventModule {}

import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { ContentModule } from '../content/content.module';
import { OperationsDecisionController } from './operations-decision.controller';
import { OperationsDecisionRepository } from './operations-decision.repository';
import { PredxNewsClientService } from './predx-news/predx-news-client.service';
import { PredxNewsNormalizerService } from './predx-news/predx-news-normalizer.service';
import { OperationRecommendationAgentService } from './recommendation/operation-recommendation-agent.service';
import { OperationRecommendationSchedulerService } from './recommendation/operation-recommendation-scheduler.service';
import { OperationRecommendationService } from './recommendation/operation-recommendation.service';

@Module({
  imports: [AgentModule, ContentModule],
  controllers: [OperationsDecisionController],
  providers: [
    OperationsDecisionRepository,
    PredxNewsClientService,
    PredxNewsNormalizerService,
    OperationRecommendationAgentService,
    OperationRecommendationSchedulerService,
    OperationRecommendationService,
  ],
})
export class OperationsDecisionModule {}

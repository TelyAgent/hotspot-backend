import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { AssistantModule } from './assistant/assistant.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataSourceModule } from './data-source/data-source.module';
import { PrismaModule } from './database/prisma.module';
import { AssignmentModule } from './assignment/assignment.module';
import { ContentModule } from './content/content.module';
import { CopilotModule } from './copilot/copilot.module';
import { EventMergeModule } from './event-merge/event-merge.module';
import { FutureEventModule } from './future-event/future-event.module';
import { McpModule } from './mcp/mcp.module';
import { OpportunityModule } from './opportunity/opportunity.module';
import { OperationsDecisionModule } from './operations-decision/operations-decision.module';
import { PerformanceModule } from './performance/performance.module';
import { ProjectConfigModule } from './project-config/project-config.module';
import { SignalModule } from './signal/signal.module';
import { TopicWatchModule } from './topic-watch/topic-watch.module';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SignalModule,
    DataSourceModule,
    ProjectConfigModule,
    AgentModule,
    AssistantModule,
    FutureEventModule,
    TopicWatchModule,
    OpportunityModule,
    OperationsDecisionModule,
    AssignmentModule,
    ContentModule,
    CopilotModule,
    EventMergeModule,
    PerformanceModule,
    YoutubeModule,
    McpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

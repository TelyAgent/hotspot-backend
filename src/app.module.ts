import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataSourceModule } from './data-source/data-source.module';
import { PrismaModule } from './database/prisma.module';
import { AssignmentModule } from './assignment/assignment.module';
import { ContentModule } from './content/content.module';
import { EventMergeModule } from './event-merge/event-merge.module';
import { FutureEventModule } from './future-event/future-event.module';
import { OpportunityModule } from './opportunity/opportunity.module';
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
    FutureEventModule,
    TopicWatchModule,
    OpportunityModule,
    AssignmentModule,
    ContentModule,
    EventMergeModule,
    PerformanceModule,
    YoutubeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

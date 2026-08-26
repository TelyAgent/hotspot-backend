import { Module } from '@nestjs/common';
import { ProjectConfigModule } from '../project-config/project-config.module';
import { TopicWatchModule } from '../topic-watch/topic-watch.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ProjectConfigModule, TopicWatchModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}

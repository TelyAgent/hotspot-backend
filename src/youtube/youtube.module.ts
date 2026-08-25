import { Module } from '@nestjs/common';
import { DataSourceModule } from '../data-source/data-source.module';
import { PrismaModule } from '../database/prisma.module';
import { YoutubeAnalysisService } from './youtube-analysis.service';
import { YoutubeController } from './youtube.controller';
import { YoutubeSchedulerService } from './youtube-scheduler.service';
import { YoutubeService } from './youtube.service';
import { YoutubeTranscriptExtractor } from './youtube-transcript.extractor';

@Module({
  imports: [DataSourceModule, PrismaModule],
  controllers: [YoutubeController],
  providers: [
    YoutubeService,
    YoutubeAnalysisService,
    YoutubeTranscriptExtractor,
    YoutubeSchedulerService,
  ],
})
export class YoutubeModule {}

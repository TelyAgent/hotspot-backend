import { Controller, Get, Param, Post } from '@nestjs/common';
import { YoutubeService } from './youtube.service';

@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Post('run')
  run() {
    return this.youtubeService.run();
  }

  @Get('runs/latest')
  latestRun() {
    return this.youtubeService.latestRun();
  }

  @Get('videos/board')
  board() {
    return this.youtubeService.board();
  }

  @Post('videos/analyze-missing')
  analyzeMissing() {
    return this.youtubeService.analyzeMissing();
  }

  @Post('videos/:videoId/analyze')
  analyzeVideo(@Param('videoId') videoId: string) {
    return this.youtubeService.analyzeVideo(videoId);
  }
}

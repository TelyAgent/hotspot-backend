import { Injectable, OnModuleInit } from '@nestjs/common';
import { MockDataSourcePlugin } from '../plugins/mock/mock.plugin';
import { XAccountPostsPlugin } from '../plugins/x-account-posts/x-account-posts.plugin';
import { XTrendsPlugin } from '../plugins/x-trends/x-trends.plugin';
import { YoutubeVideosPlugin } from '../plugins/youtube-videos/youtube-videos.plugin';
import { DataSourcePluginRegistry } from './data-source-plugin.registry';

@Injectable()
export class DataSourcePluginRegistrationService implements OnModuleInit {
  constructor(
    private readonly registry: DataSourcePluginRegistry,
    private readonly mockPlugin: MockDataSourcePlugin,
    private readonly xAccountPostsPlugin: XAccountPostsPlugin,
    private readonly xTrendsPlugin: XTrendsPlugin,
    private readonly youtubeVideosPlugin: YoutubeVideosPlugin,
  ) {}

  onModuleInit(): void {
    for (const plugin of [
      this.mockPlugin,
      this.xAccountPostsPlugin,
      this.xTrendsPlugin,
      this.youtubeVideosPlugin,
    ]) {
      this.registry.register(plugin);
    }
  }
}

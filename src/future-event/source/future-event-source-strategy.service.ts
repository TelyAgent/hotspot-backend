import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_STRATEGY_PATH = 'docs/runtime/future-event-source-strategy.md';

@Injectable()
export class FutureEventSourceStrategyService {
  constructor(private readonly configService: ConfigService) {}

  async readStrategy() {
    const path = this.getStrategyPath();
    return {
      path,
      markdown: await readFile(path, 'utf8'),
    };
  }

  async writeStrategy(markdown: string) {
    const path = this.getStrategyPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, markdown, 'utf8');
    return {
      path,
      markdown,
    };
  }

  getStrategyPath() {
    const configured = this.configService.get<string>(
      'FUTURE_EVENT_SOURCE_STRATEGY_PATH',
    );
    return resolve(process.cwd(), configured || DEFAULT_STRATEGY_PATH);
  }
}

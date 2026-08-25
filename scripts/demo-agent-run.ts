import { NestFactory } from '@nestjs/core';
import { AGENT_WORKFLOW_ENGINE } from '../src/agent/agent.tokens';
import { AgentWorkflowEngine } from '../src/agent/workflow-engine/agent-workflow-engine.interface';
import { JsonObject, JsonValue } from '../src/common/types/json.type';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/hotspot_agent';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const workflowEngine = app.get<AgentWorkflowEngine>(AGENT_WORKFLOW_ENGINE);
    const context = await loadDemoContext(prisma);

    const result = await workflowEngine.run({
      agentType: 'opportunity_mining',
      maxSteps: 6,
      goal: {
        instruction:
          '基于 demo seed 数据判断是否应该形成内容机会。必须输出中文，必须说明证据、缺失数据和风险。',
        signals: context.signals,
        evidence: context.evidence,
        topicCandidates: context.topicCandidates,
      },
    });

    console.log(
      JSON.stringify(
        {
          status: result.status,
          runId: result.runId,
          result: result.result ?? null,
          errorMessage: result.errorMessage ?? null,
          debugUrls: {
            run: `/agent/runs/${result.runId}`,
            steps: `/agent/runs/${result.runId}/steps`,
            toolCalls: `/agent/runs/${result.runId}/tool-calls`,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function loadDemoContext(prisma: PrismaService): Promise<{
  signals: JsonObject[];
  evidence: JsonObject[];
  topicCandidates: JsonObject[];
}> {
  const [signals, evidence, topicCandidates] = await Promise.all([
    prisma.signal.findMany({
      where: {
        id: 'demo_signal_openai_model_release',
      },
      take: 1,
    }),
    prisma.evidenceItem.findMany({
      where: {
        id: 'demo_evidence_openai_model_release',
      },
      take: 1,
    }),
    prisma.topicCandidate.findMany({
      where: {
        id: 'demo_candidate_openai_model_release',
      },
      take: 1,
    }),
  ]);

  if (signals.length === 0 || evidence.length === 0) {
    throw new Error(
      'Demo seed data is missing. Run `npm run db:seed` before `npm run demo:agent`.',
    );
  }

  return {
    signals: signals.map((item) => toJsonObject(item)),
    evidence: evidence.map((item) => toJsonObject(item)),
    topicCandidates: topicCandidates.map((item) => toJsonObject(item)),
  };
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Date) {
        return item.toISOString();
      }

      return item;
    }),
  ) as JsonObject;
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        errorMessage:
          error instanceof Error ? error.message : 'Unknown demo run error',
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

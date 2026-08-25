import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AGENT_WORKFLOW_ENGINE } from '../src/agent/agent.tokens';
import { AgentWorkflowEngine } from '../src/agent/workflow-engine/agent-workflow-engine.interface';
import { AccountProvider } from '../src/assignment/account-provider/account-provider.interface';
import { ACCOUNT_PROVIDER } from '../src/assignment/assignment.tokens';
import {
  AssignmentDecision,
  AssignmentItemDecision,
} from '../src/assignment/assignment.types';
import { JsonObject, JsonValue } from '../src/common/types/json.type';
import { AppModule } from '../src/app.module';
import { ContentGenerationDecision, ContentTask } from '../src/content/content.types';
import { PrismaService } from '../src/database/prisma.service';
import { OpportunityMiningDecision } from '../src/opportunity/opportunity.types';

process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/hotspot_agent';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const workflowEngine = app.get<AgentWorkflowEngine>(AGENT_WORKFLOW_ENGINE);
    const accountProvider = app.get<AccountProvider>(ACCOUNT_PROVIDER);
    const context = await loadDemoContext(prisma);
    const accounts = await accountProvider.listAccounts({
      includePaused: false,
      topics: ['AI', '产品机会'],
    });

    const opportunityRun = await workflowEngine.run({
      agentType: 'opportunity_mining',
      maxSteps: 6,
      goal: {
        instruction:
          '基于 demo 数据形成一个可落库的内容机会判断。必须输出中文，并严格遵守 opportunity_mining 输出契约。',
        signals: context.signals,
        evidence: context.evidence,
        topicCandidates: context.topicCandidates,
      },
    });
    const opportunityDecision = requireSucceededDecision<OpportunityMiningDecision>(
      opportunityRun,
      'opportunity_mining',
    );
    const opportunity = await persistOpportunity(prisma, opportunityDecision);

    const assignmentRun = await workflowEngine.run({
      agentType: 'assignment',
      maxSteps: 5,
      goal: {
        instruction:
          '为 demo 内容机会选择最合适的运营账号。至少选择 1 个账号，角度不能重复，必须严格遵守 assignment 输出契约。',
        targetType: 'opportunity',
        targetId: opportunity.id,
        targetContext: toJsonObject(opportunity),
        accounts: accounts.map((account) => toJsonObject(account)),
      },
    });
    const assignmentDecision = requireSucceededDecision<AssignmentDecision>(
      assignmentRun,
      'assignment',
    );
    const assignment = await persistAssignment(
      prisma,
      assignmentDecision,
      opportunity.id,
    );

    const firstAssignment = assignmentDecision.assignments[0];
    const contentTask = await persistContentTask(
      prisma,
      opportunity.id,
      firstAssignment,
    );
    const selectedAccount =
      accounts.find((account) => account.id === firstAssignment.accountId) ??
      accounts[0];

    const contentRun = await workflowEngine.run({
      agentType: 'content_generation',
      maxSteps: 4,
      goal: {
        instruction:
          '为 demo 内容任务生成一版中文草稿。必须引用 evidenceRefs，严格遵守 content_generation 输出契约。',
        contentTask: toJsonObject(contentTask),
        accountPersona: selectedAccount.persona,
        contentRules: selectedAccount.contentRules,
        generationPrompt: selectedAccount.generationPrompt ?? null,
        evidence: context.evidence,
      },
    });
    const contentDecision = requireSucceededDecision<ContentGenerationDecision>(
      contentRun,
      'content_generation',
    );
    const contentDraft = await persistContentDraft(
      prisma,
      contentTask,
      contentDecision,
    );

    console.log(
      JSON.stringify(
        {
          status: 'succeeded',
          opportunity: {
            id: opportunity.id,
            title: opportunity.title,
            agentRunId: opportunityRun.runId,
          },
          assignment: {
            runId: assignment.id,
            agentRunId: assignmentRun.runId,
            itemCount: assignmentDecision.assignments.length,
          },
          contentTask: {
            id: contentTask.id,
          },
          contentDraft: {
            id: contentDraft.id,
            version: contentDraft.version,
            agentRunId: contentRun.runId,
          },
          debugUrls: {
            opportunitySteps: `/agent/runs/${opportunityRun.runId}/steps`,
            assignmentSteps: `/agent/runs/${assignmentRun.runId}/steps`,
            contentSteps: `/agent/runs/${contentRun.runId}/steps`,
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
      where: { id: 'demo_signal_openai_model_release' },
      take: 1,
    }),
    prisma.evidenceItem.findMany({
      where: { id: 'demo_evidence_openai_model_release' },
      take: 1,
    }),
    prisma.topicCandidate.findMany({
      where: { id: 'demo_candidate_openai_model_release' },
      take: 1,
    }),
  ]);

  if (signals.length === 0 || evidence.length === 0) {
    throw new Error(
      'Demo seed data is missing. Run `npm run db:seed` before `npm run demo:pipeline`.',
    );
  }

  return {
    signals: signals.map(toJsonObject),
    evidence: evidence.map(toJsonObject),
    topicCandidates: topicCandidates.map(toJsonObject),
  };
}

function requireSucceededDecision<T>(
  result: {
    runId: string;
    status: 'succeeded' | 'failed';
    result?: JsonValue;
    errorMessage?: string;
  },
  agentType: string,
): T {
  if (result.status !== 'succeeded' || !isJsonObject(result.result)) {
    throw new Error(
      `${agentType} failed. runId=${result.runId}, error=${result.errorMessage ?? 'missing result'}`,
    );
  }

  return result.result as unknown as T;
}

async function persistOpportunity(
  prisma: PrismaService,
  decision: OpportunityMiningDecision,
) {
  return prisma.opportunity.upsert({
    where: { id: 'demo_pipeline_opportunity' },
    update: {
      title: decision.title,
      type: decision.opportunityType,
      summary: decision.summary,
      whyNow: decision.whyNow,
      whyItMatters: decision.whyItMatters,
      productAngles: decision.productAngles,
      contentWindow: decision.contentWindow,
      evidenceRefs: decision.evidenceRefs,
      missingData: decision.missingData,
      riskNotes: decision.riskNotes,
      confidence: decision.confidence,
      status: 'suggested',
    },
    create: {
      id: 'demo_pipeline_opportunity',
      title: decision.title,
      type: decision.opportunityType,
      summary: decision.summary,
      whyNow: decision.whyNow,
      whyItMatters: decision.whyItMatters,
      productAngles: decision.productAngles,
      contentWindow: decision.contentWindow,
      evidenceRefs: decision.evidenceRefs,
      missingData: decision.missingData,
      riskNotes: decision.riskNotes,
      confidence: decision.confidence,
      status: 'suggested',
    },
  });
}

async function persistAssignment(
  prisma: PrismaService,
  decision: AssignmentDecision,
  targetId: string,
) {
  const run = await prisma.assignmentRun.upsert({
    where: { id: 'demo_pipeline_assignment_run' },
    update: {
      targetType: 'opportunity',
      targetId,
      status: 'succeeded',
      goal: { targetId, targetType: 'opportunity' },
      decision: decision as unknown as Prisma.InputJsonValue,
      confidence: decision.confidence,
      riskNotes: decision.riskNotes,
      missingData: decision.missingData,
      finishedAt: new Date(),
    },
    create: {
      id: 'demo_pipeline_assignment_run',
      targetType: 'opportunity',
      targetId,
      status: 'succeeded',
      goal: { targetId, targetType: 'opportunity' },
      decision: decision as unknown as Prisma.InputJsonValue,
      confidence: decision.confidence,
      riskNotes: decision.riskNotes,
      missingData: decision.missingData,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  for (const item of decision.assignments) {
    await prisma.assignmentItem.upsert({
      where: { id: `demo_pipeline_assignment_item_${item.accountId}` },
      update: createAssignmentItemData(run.id, targetId, item),
      create: {
        id: `demo_pipeline_assignment_item_${item.accountId}`,
        runId: run.id,
        ...createAssignmentItemData(run.id, targetId, item),
      },
    });
  }

  return run;
}

function createAssignmentItemData(
  _runId: string,
  targetId: string,
  item: AssignmentItemDecision,
) {
  return {
    targetType: 'opportunity',
    targetId,
    accountId: item.accountId,
    accountSource: item.accountSource,
    sourceSystem: item.sourceSystem ?? null,
    priority: item.priority,
    contentType: item.contentType,
    contentGoal: item.contentGoal,
    angle: item.angle,
    constraints: item.constraints,
    reason: item.reason,
    evidenceRefs: item.evidenceRefs,
    duplicateRisk: item.duplicateRisk,
    status: 'suggested',
    createdTaskId: null,
  };
}

async function persistContentTask(
  prisma: PrismaService,
  targetId: string,
  assignment: AssignmentItemDecision,
): Promise<ContentTask> {
  return prisma.contentTask.upsert({
    where: { id: 'demo_pipeline_content_task' },
    update: {
      targetType: 'opportunity',
      targetId,
      accountId: assignment.accountId,
      contentType: assignment.contentType,
      contentGoal: assignment.contentGoal,
      angle: assignment.angle,
      constraints: assignment.constraints,
      evidenceRefs: assignment.evidenceRefs,
      status: 'confirmed',
    },
    create: {
      id: 'demo_pipeline_content_task',
      targetType: 'opportunity',
      targetId,
      accountId: assignment.accountId,
      contentType: assignment.contentType,
      contentGoal: assignment.contentGoal,
      angle: assignment.angle,
      constraints: assignment.constraints,
      evidenceRefs: assignment.evidenceRefs,
      status: 'confirmed',
    },
  }) as unknown as Promise<ContentTask>;
}

async function persistContentDraft(
  prisma: PrismaService,
  contentTask: ContentTask,
  decision: ContentGenerationDecision,
) {
  return prisma.contentDraft.upsert({
    where: {
      contentTaskId_version: {
        contentTaskId: contentTask.id,
        version: 1,
      },
    },
    update: {
      body: decision.body,
      evidenceRefs: decision.evidenceRefs,
      generationInput: {
        demoPipeline: true,
        contentTaskId: contentTask.id,
      },
      status: 'draft',
    },
    create: {
      id: 'demo_pipeline_content_draft_v1',
      contentTaskId: contentTask.id,
      version: 1,
      body: decision.body,
      evidenceRefs: decision.evidenceRefs,
      generationInput: {
        demoPipeline: true,
        contentTaskId: contentTask.id,
      },
      userInstruction: null,
      status: 'draft',
    },
  });
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

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        errorMessage:
          error instanceof Error ? error.message : 'Unknown demo pipeline error',
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

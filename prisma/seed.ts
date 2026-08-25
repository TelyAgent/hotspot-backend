import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const observedAt = new Date('2026-08-24T10:00:00.000Z');
  const observedAtBucket = new Date('2026-08-24T10:00:00.000Z');

  await prisma.projectConfig.upsert({
    where: {
      key: 'x.trends.regions',
    },
    update: {},
    create: {
      key: 'x.trends.regions',
      value: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
      description: 'X 热榜采集地区列表。',
      updatedBy: 'seed',
    },
  });

  await prisma.projectConfig.upsert({
    where: {
      key: 'x.trends.limit',
    },
    update: {},
    create: {
      key: 'x.trends.limit',
      value: 30,
      description: '每个地区采集的 X 热榜条数。',
      updatedBy: 'seed',
    },
  });

  await prisma.projectConfig.upsert({
    where: {
      key: 'x.trends.collectionIntervalMs',
    },
    update: {},
    create: {
      key: 'x.trends.collectionIntervalMs',
      value: 2 * 60 * 60 * 1000,
      description: 'X 热榜自动采集间隔，单位毫秒。',
      updatedBy: 'seed',
    },
  });

  const rawItem = await prisma.rawItem.upsert({
    where: {
      dedupeKey: 'demo:x_post:openai_model_release:2026-08-24T10',
    },
    update: {},
    create: {
      id: 'demo_raw_openai_model_release',
      source: 'demo',
      sourceType: 'x_post',
      sourceItemId: 'demo_x_post_1',
      observedAt,
      observedAtBucket,
      dedupeKey: 'demo:x_post:openai_model_release:2026-08-24T10',
      payload: {
        authorHandle: 'OpenAI',
        text: 'OpenAI 发布新模型能力更新，开发者社区开始讨论产品接入方式。',
        url: 'https://x.com/OpenAI/status/demo_x_post_1',
        metrics: {
          likes: 1200,
          replies: 180,
          reposts: 260,
          views: 180000,
        },
      },
      metadata: {
        demo: true,
      },
    },
  });

  const signal = await prisma.signal.upsert({
    where: {
      id: 'demo_signal_openai_model_release',
    },
    update: {},
    create: {
      id: 'demo_signal_openai_model_release',
      rawItemId: rawItem.id,
      source: 'demo',
      platform: 'x',
      signalType: 'viral_post',
      title: 'OpenAI 新模型发布引发开发者讨论',
      summary: 'OpenAI 发布模型能力更新，社区开始讨论产品接入、API 成本和使用场景。',
      observedAt,
      rawRefs: [rawItem.id],
      metrics: {
        likes: 1200,
        replies: 180,
        reposts: 260,
        views: 180000,
      },
      metadata: {
        demo: true,
        topics: ['AI', '开发者工具', '产品机会'],
      },
    },
  });

  const evidence = await prisma.evidenceItem.upsert({
    where: {
      id: 'demo_evidence_openai_model_release',
    },
    update: {},
    create: {
      id: 'demo_evidence_openai_model_release',
      signalId: signal.id,
      sourceType: 'x_post',
      sourceItemId: 'demo_x_post_1',
      claim: 'OpenAI 发布新模型能力更新，开发者社区正在讨论接入方式。',
      text: 'OpenAI 发布新模型能力更新，开发者社区开始讨论产品接入方式。',
      url: 'https://x.com/OpenAI/status/demo_x_post_1',
      author: 'OpenAI',
      publishedAt: observedAt,
      observedAt,
      metrics: {
        likes: 1200,
        replies: 180,
        reposts: 260,
        views: 180000,
      },
      confidence: 'high',
      rawRef: rawItem.id,
      metadata: {
        demo: true,
      },
    },
  });

  const topicWatch = await prisma.topicWatch.upsert({
    where: {
      id: 'demo_topic_ai_products',
    },
    update: {},
    create: {
      id: 'demo_topic_ai_products',
      name: 'AI 产品机会追踪',
      description: '追踪 AI 模型、开发者工具和产品承接机会。',
      domains: ['AI', 'SaaS', '开发者工具'],
      watchIntent: '发现可以结合自身产品输出内容的 AI 热点机会。',
      collectionPolicy: '优先观察 X 热门帖子、官方账号和开发者社区讨论。',
      triggerPolicy: '当多来源讨论同一产品变化，或单条帖子显著高于近期表现时，交给 Agent 判断是否形成机会。',
      evidencePolicy: '必须保留官方来源、代表帖链接和关键指标。',
      exclusionPolicy: '排除纯教程、促销和无事实依据的猜测。',
      status: 'active',
      ownerId: 'demo_operator',
    },
  });

  await prisma.topicCandidate.upsert({
    where: {
      id: 'demo_candidate_openai_model_release',
    },
    update: {},
    create: {
      id: 'demo_candidate_openai_model_release',
      topicWatchId: topicWatch.id,
      title: 'OpenAI 新模型发布带来产品接入机会',
      summary: '开发者开始讨论新模型能力、API 接入和产品落地场景。',
      keywords: ['OpenAI', '新模型', 'API', '产品接入'],
      entities: ['OpenAI'],
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      signalCount: 1,
      postCount: 1,
      accountCount: 1,
      sourceTypes: ['x_post'],
      representativeSignalIds: [signal.id],
      evidenceRefs: [evidence.id],
      metrics: {
        views: 180000,
        engagement: 1640,
      },
      clustering: {
        method: 'demo_seed',
      },
      status: 'new',
    },
  });

  const opportunity = await prisma.opportunity.upsert({
    where: {
      id: 'demo_opportunity_ai_model_product_angle',
    },
    update: {},
    create: {
      id: 'demo_opportunity_ai_model_product_angle',
      title: '围绕 OpenAI 新模型解释产品接入价值',
      type: 'industry_topic',
      summary: '借助 OpenAI 新模型发布热度，解释产品如何降低 AI 接入门槛。',
      whyNow: '官方发布带来集中讨论，开发者正在寻找可落地的接入路径。',
      whyItMatters: '热点本身具备教育用户的窗口，可以自然承接产品能力。',
      productAngles: ['低成本接入', '工作流自动化', '开发者效率'],
      contentWindow: '24-48 小时',
      evidenceRefs: [evidence.id],
      missingData: [],
      riskNotes: ['需要避免夸大模型能力，所有结论以官方发布和可验证讨论为准。'],
      confidence: 'medium',
      status: 'suggested',
    },
  });

  await prisma.event.upsert({
    where: {
      id: 'demo_event_openai_model_release',
    },
    update: {},
    create: {
      id: 'demo_event_openai_model_release',
      title: 'OpenAI 发布新模型能力更新',
      eventType: 'model_release',
      summary: 'OpenAI 发布模型能力更新，引发开发者关于接入方式和产品场景的讨论。',
      occurredAt: observedAt,
      evidenceRefs: [evidence.id],
      missingData: [],
      riskNotes: ['demo 数据仅用于本地演示。'],
      confidence: 'high',
      status: 'suggested',
    },
  });

  const assignmentRun = await prisma.assignmentRun.upsert({
    where: {
      id: 'demo_assignment_run_ai_model',
    },
    update: {},
    create: {
      id: 'demo_assignment_run_ai_model',
      targetType: 'opportunity',
      targetId: opportunity.id,
      status: 'succeeded',
      goal: {
        targetId: opportunity.id,
        targetType: 'opportunity',
      },
      decision: {
        decision: 'assign',
        summary: '建议使用产品承接型账号输出产品接入角度。',
      },
      confidence: 'medium',
      riskNotes: [],
      missingData: [],
      startedAt: observedAt,
      finishedAt: observedAt,
    },
  });

  await prisma.contentTask.upsert({
    where: {
      id: 'demo_content_task_ai_model',
    },
    update: {},
    create: {
      id: 'demo_content_task_ai_model',
      targetType: 'opportunity',
      targetId: opportunity.id,
      accountId: 'demo_account_product',
      contentType: 'product_angle_post',
      contentGoal: '解释新模型能力变化如何转化为产品工作流价值。',
      angle: '从开发者接入成本切入，承接产品自动化能力。',
      constraints: ['必须引用证据', '不得夸大模型能力', '输出中文'],
      evidenceRefs: [evidence.id],
      status: 'confirmed',
    },
  });

  await prisma.assignmentItem.upsert({
    where: {
      id: 'demo_assignment_item_ai_model',
    },
    update: {},
    create: {
      id: 'demo_assignment_item_ai_model',
      runId: assignmentRun.id,
      targetType: 'opportunity',
      targetId: opportunity.id,
      accountId: 'demo_account_product',
      accountSource: 'local',
      sourceSystem: null,
      priority: 'medium',
      contentType: 'product_angle_post',
      contentGoal: '解释新模型能力变化如何转化为产品工作流价值。',
      angle: '从开发者接入成本切入，承接产品自动化能力。',
      constraints: ['必须引用证据', '不得夸大模型能力', '输出中文'],
      reason: '该账号适合产品承接型内容，能够把行业热点转成产品价值说明。',
      evidenceRefs: [evidence.id],
      duplicateRisk: 'low',
      status: 'confirmed',
      createdTaskId: 'demo_content_task_ai_model',
    },
  });

  await prisma.contentDraft.upsert({
    where: {
      contentTaskId_version: {
        contentTaskId: 'demo_content_task_ai_model',
        version: 1,
      },
    },
    update: {},
    create: {
      id: 'demo_content_draft_ai_model_v1',
      contentTaskId: 'demo_content_task_ai_model',
      version: 1,
      body: 'OpenAI 新模型发布后，真正值得关注的不只是参数变化，而是它会不会降低团队把 AI 接进工作流的成本。对产品团队来说，机会在于把“能调用模型”继续推进到“能稳定完成业务动作”。',
      evidenceRefs: [evidence.id],
      generationInput: {
        demo: true,
        contentTaskId: 'demo_content_task_ai_model',
      },
      userInstruction: null,
      status: 'draft',
    },
  });

  const publishedPost = await prisma.publishedPost.upsert({
    where: {
      id: 'demo_published_post_ai_model',
    },
    update: {},
    create: {
      id: 'demo_published_post_ai_model',
      contentTaskId: 'demo_content_task_ai_model',
      platform: 'x',
      url: 'https://x.com/demo/status/demo_published_post_ai_model',
      publishedAt: observedAt,
      firstTrackedAt: observedAt,
      lastTrackedAt: observedAt,
      trackingStatus: 'active',
    },
  });

  await prisma.postMetricSnapshot.upsert({
    where: {
      id: 'demo_metric_snapshot_ai_model',
    },
    update: {},
    create: {
      id: 'demo_metric_snapshot_ai_model',
      publishedPostId: publishedPost.id,
      observedAt,
      likes: 32,
      replies: 4,
      reposts: 8,
      quotes: 1,
      views: 2400,
      rawMetrics: {
        demo: true,
      },
      isMissingData: false,
      errorMessage: null,
    },
  });

  console.log('Seed completed: demo RawItem / Signal / Evidence / TopicWatch / Opportunity / ContentTask created.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

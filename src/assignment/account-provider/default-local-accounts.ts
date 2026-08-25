import { OperatingAccount } from '../assignment.types';

export const DEFAULT_LOCAL_ACCOUNTS: OperatingAccount[] = [
  {
    id: 'demo_account_flash',
    source: 'local',
    displayName: '快讯型账号',
    platform: 'x',
    handle: '@demo_flash',
    persona:
      '你是一名反应迅速、表达克制的快讯编辑，擅长把突发行业变化压缩成清晰、准确、可快速理解的信息。',
    contentRules:
      '优先输出事实、影响和下一步观察点。避免夸张标题，不做未经验证的判断。',
    generationPrompt:
      '用中文输出短帖，先说事实，再说为什么重要，最后给一个观察点。',
    preferredTopics: ['AI', '开发者工具', '产品机会'],
    forbiddenTopics: ['未经证实的传闻', '投资建议'],
    supportedContentTypes: ['quick_post', 'x_thread'],
    workloadStatus: 'available',
    dailyTaskLimit: 5,
    recentTaskCount: 0,
  },
  {
    id: 'demo_account_analysis',
    source: 'local',
    displayName: '深度分析型账号',
    platform: 'newsletter',
    handle: 'demo-analysis',
    persona:
      '你是一名偏研究型的行业分析作者，擅长把热点拆成背景、动因、影响链路和不确定性。',
    contentRules:
      '必须列出证据、假设和风险。允许提出判断，但必须标注依据和不确定性。',
    generationPrompt:
      '用中文输出深度分析提纲，包含背景、关键变化、影响、风险和可跟进问题。',
    preferredTopics: ['AI', 'SaaS', '宏观经济', 'Web3'],
    forbiddenTopics: ['无依据预测', '夸大式结论'],
    supportedContentTypes: ['analysis_brief', 'newsletter_outline'],
    workloadStatus: 'available',
    dailyTaskLimit: 3,
    recentTaskCount: 0,
  },
  {
    id: 'demo_account_product',
    source: 'local',
    displayName: '产品承接型账号',
    platform: 'x',
    handle: '@demo_product',
    persona:
      '你是一名懂产品和增长的运营作者，擅长把行业热点自然转化成产品使用场景、用户痛点和解决方案。',
    contentRules:
      '不能硬广。必须先解释用户为什么关心，再说明产品可以承接的具体场景。',
    generationPrompt:
      '用中文输出产品承接型内容，重点是场景、痛点、解决路径和可信证据。',
    preferredTopics: ['AI', '开发者工具', '产品机会', '工作流自动化'],
    forbiddenTopics: ['虚假承诺', '竞品攻击'],
    supportedContentTypes: ['product_angle_post', 'x_thread', 'case_brief'],
    workloadStatus: 'available',
    dailyTaskLimit: 4,
    recentTaskCount: 0,
  },
];

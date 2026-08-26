import { TopicWatchSingleTriggerPolicy } from '../topic-watch.types';

export interface DefaultTopicWatchAccountConfig {
  handle: string;
  primaryRole: string;
  singleTriggerPolicy: TopicWatchSingleTriggerPolicy;
  authorityScope: string;
  sortOrder: number;
}

export const DEFAULT_TOPIC_WATCH_ACCOUNTS: Record<string, DefaultTopicWatchAccountConfig[]> = {
  'topic-politics-election': withOrder([
    ['@Reuters', '专业新闻媒体', 'C', '新闻报道'],
    ['@AP', '专业新闻媒体', 'C', '新闻报道'],
    ['@CNNPolitics', '专业新闻媒体', 'C', '政治新闻报道'],
    ['@POLITICO', '专业新闻媒体', 'C', '政治新闻报道'],
    ['@axios', '专业新闻媒体', 'C', '新闻报道'],
    ['@thehill', '专业新闻媒体', 'C', '政治新闻报道'],
    ['@nprpolitics', '专业新闻媒体', 'C', '政治新闻报道'],
    ['@BBCWorld', '专业新闻媒体', 'C', '国际新闻报道'],
    ['@DecisionDeskHQ', '选举数据与快速雷达', 'C', '选举数据、预测和结果判断不等于政府官方结果'],
    ['@NateSilver538', '分析、预测和观点', 'C', '民调、预测、分析和观点'],
  ]),
  'topic-crypto-web3': withOrder([
    ['@CoinDesk', '专业新闻媒体', 'C', 'Crypto 新闻报道'],
    ['@Cointelegraph', '专业新闻媒体', 'C', 'Crypto 新闻报道'],
    ['@cryptocom', '第一方权威账号', 'S1', 'Crypto.com 自身产品、合作、监管、安全和经营变化'],
    ['@WuBlockchain', '快速聚合与市场雷达', 'C', 'Crypto 快讯与市场信息'],
    ['@tier10k', '快速聚合与市场雷达', 'C', '快讯和市场信息'],
    ['@WatcherGuru', '快速聚合与市场雷达', 'C', '快讯和市场信息'],
    ['@lookonchain', '链上数据雷达', 'C', '链上活动不自动等于现实事件'],
    ['@BitcoinMagazine', '专业新闻媒体', 'C', 'Bitcoin 新闻与行业内容'],
    ['@DecryptMedia', '专业新闻媒体', 'C', 'Crypto 新闻报道'],
    ['@DefiLlama', '数据与市场雷达', 'C', 'DeFi 数据和市场变化'],
  ]),
  'topic-ai-tech': withOrder([
    ['@OpenAI', '第一方权威账号', 'S1', 'OpenAI 公司、模型和产品'],
    ['@OpenAIDevs', '第一方权威账号', 'S1', 'OpenAI API、开发者产品和 Codex 开发能力'],
    ['@AnthropicAI', '第一方权威账号', 'S1', 'Anthropic 公司、模型和产品'],
    ['@claudeai', '第一方权威账号', 'S1', 'Claude 产品'],
    ['@GoogleDeepMind', '第一方权威账号', 'S1', 'Google DeepMind 研究、模型和产品'],
    ['@GoogleAI', '第一方权威账号', 'S1', 'Google AI 研究和产品'],
    ['@AIatMeta', '第一方权威账号', 'S1', 'Meta AI、FAIR 和 Llama'],
    ['@spacexai', '第一方权威账号', 'S1', 'xAI 公司、模型和产品'],
    ['@deepseek_ai', '第一方权威账号', 'S1', 'DeepSeek 公司、模型和产品'],
    ['@Alibaba_Qwen', '第一方权威账号', 'S1', 'Qwen 模型和产品'],
    ['@cursor_ai', '第一方权威账号', 'S1', 'Cursor 产品和服务'],
    ['@nvidia', '第一方权威账号', 'S1', 'NVIDIA 产品、芯片、合作和经营变化'],
    ['@sama', '核心人物与决策者', 'S2', '本人或 OpenAI 的明确重大行动'],
    ['@thsottiaux', '核心人物与决策者', 'S2', '本人负责范围内的 OpenAI 产品与 Codex 行动'],
    ['@DarioAmodei', '核心人物与决策者', 'S2', '本人或 Anthropic 的明确重大行动'],
    ['@demishassabis', '核心人物与决策者', 'S2', '本人或 Google DeepMind 的明确重大行动'],
    ['@ylecun', '分析、预测和观点', 'C', 'AI 研究、分析和观点'],
    ['@elonmusk', '核心人物与决策者', 'S2', '本人或其所属公司的明确重大行动；普通评论不触发 S2'],
    ['@TechCrunch', '专业新闻媒体', 'C', '科技新闻报道'],
  ]),
  'topic-macro-finance': withOrder([
    ['@business', '专业新闻媒体', 'C', 'Bloomberg 新闻报道'],
    ['@ReutersBiz', '专业新闻媒体', 'C', '商业与金融新闻报道'],
    ['@CNBC', '专业新闻媒体', 'C', '财经新闻报道'],
    ['@FinancialTimes', '专业新闻媒体', 'C', '财经新闻报道'],
    ['@WSJ', '专业新闻媒体', 'C', '财经新闻报道'],
    ['@TheEconomist', '专业媒体与分析', 'C', '新闻、分析和观点'],
    ['@federalreserve', '第一方权威机构', 'S1', '美联储政策、利率决定、会议和正式公告'],
    ['@BLS_gov', '第一方权威机构', 'S1', 'BLS 正式经济与就业数据'],
    ['@KobeissiLetter', '市场雷达与分析', 'C', '市场快讯、数据解读和观点'],
    ['@DeItaone', '快速聚合与市场雷达', 'C', '财经快讯和转述'],
  ]),
  'topic-prediction-market': withOrder([
    ['@Polymarket', '第一方权威账号', 'S1', 'Polymarket 产品、监管、合作、结算、安全和经营变化'],
    ['@Kalshi', '第一方权威账号', 'S1', 'Kalshi 产品、监管、合作、结算、安全和经营变化'],
    ['@PolymarketIntel', '社区新闻与快速雷达', 'C', '新闻聚合；不是 Polymarket 公司第一方确认源'],
    ['@OpinionLabsXYZ', '第一方权威账号', 'S1', 'Opinion Labs 自身产品、合作和经营变化'],
    ['@MyriadMarkets', '第一方权威账号', 'S1', 'Myriad Markets 自身产品、合作和经营变化'],
    ['@PredictIt', '第一方权威账号', 'S1', 'PredictIt 自身产品、监管、结算和经营变化'],
    ['@ZeitgeistPM', '第一方权威账号', 'S1', 'Zeitgeist 自身产品、协议和经营变化'],
    ['@PredictInsights', '数据、分析和市场雷达', 'C', '预测市场数据与分析'],
    ['@ManifoldMarkets', '第一方权威账号', 'S1', 'Manifold Markets 自身产品、规则和经营变化'],
    ['@metaculus', '第一方平台与预测数据', 'S1', 'Metaculus 自身产品、规则和经营变化；预测结果不是现实事实'],
  ]),
};

type AccountRow = [string, string, TopicWatchSingleTriggerPolicy, string];

function withOrder(rows: AccountRow[]): DefaultTopicWatchAccountConfig[] {
  return rows.map(([handle, primaryRole, singleTriggerPolicy, authorityScope], index) => ({
    handle,
    primaryRole,
    singleTriggerPolicy,
    authorityScope,
    sortOrder: index + 1,
  }));
}

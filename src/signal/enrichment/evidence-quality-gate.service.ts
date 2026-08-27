import { Injectable } from '@nestjs/common';
import {
  EvidenceQualityGateInput,
  EvidenceQualityGateResult,
} from './signal-evidence-enrichment.types';

const REASON_EVIDENCE_SOURCE_TYPES = new Set([
  'x_account_post',
  'x_trend_related_post',
  'topic_representative_post',
  'youtube_transcript_analysis',
  'future_event_source_item',
  'future_event_monitoring_signal',
]);

@Injectable()
export class EvidenceQualityGateService {
  evaluate(input: EvidenceQualityGateInput): EvidenceQualityGateResult {
    const hasOpenableSource = input.evidenceItems.some((item) =>
      Boolean(item.url),
    );
    const hasReasonEvidence = input.evidenceItems.some((item) =>
      REASON_EVIDENCE_SOURCE_TYPES.has(item.sourceType),
    );
    const hasActorActionObject = input.evidenceItems.some((item) =>
      Boolean(item.author && item.text && item.text.length >= 20),
    );

    if (input.signalType === 'x_trend' && !hasReasonEvidence) {
      return {
        level: 'thin',
        canCreateEvent: false,
        canUseHighConfidence: false,
        hasOpenableSource,
        hasReasonEvidence,
        hasActorActionObject,
        missingData: ['缺少解释热搜原因的相关帖子或外部来源。'],
        riskNotes: ['当前只有热搜榜信号，不能直接当成现实事件事实。'],
      };
    }

    if (!input.evidenceItems.length) {
      return {
        level: 'insufficient',
        canCreateEvent: false,
        canUseHighConfidence: false,
        hasOpenableSource,
        hasReasonEvidence,
        hasActorActionObject,
        missingData: ['缺少可引用证据。'],
        riskNotes: ['当前信号没有可核验来源。'],
      };
    }

    return {
      level: hasReasonEvidence ? 'usable' : 'thin',
      canCreateEvent: hasReasonEvidence,
      canUseHighConfidence: hasReasonEvidence && hasActorActionObject,
      hasOpenableSource,
      hasReasonEvidence,
      hasActorActionObject,
      missingData: hasReasonEvidence ? [] : ['缺少解释该信号原因的补充证据。'],
      riskNotes: [],
    };
  }
}

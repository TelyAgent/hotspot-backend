export interface YoutubeTranscriptSegment {
  startMs: number;
  durationMs: number | null;
  text: string;
}

export interface YoutubeTranscriptResult {
  status: 'available' | 'transcript_unavailable' | 'content_unavailable';
  provider: string;
  language: string | null;
  segments: YoutubeTranscriptSegment[];
  plainText: string;
  errorMessage?: string | null;
}

export interface YoutubeAnalysisOutput {
  main_reason: {
    topic: string;
    why_attractive: string;
    traffic_judgment: string;
  };
  execution: {
    key_technique: string;
    effect: string;
  };
  replication: {
    reusable_mechanism: string;
    product_remix_topic: string;
    product_entry: string;
  };
  limitations: string[];
}

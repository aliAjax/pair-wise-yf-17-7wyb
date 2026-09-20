/** 维护放行闭环的领域模型：音管、测量记录、维护批次、有效结果 */

export type ReedStatus = "normal" | "abnormal";

/** 测量记录在批次内的形态：当前有效 / 被复调接管的只读记录 / 环境受限的待复测记录 */
export type AttemptKind = "current" | "readonly" | "retest";

/** 维护批次状态：进行中 / 待复测 / 待复核 / 已放行 */
export type BatchStatus =
  | "open"
  | "pending_retest"
  | "pending_review"
  | "released";

export interface PipeSlot {
  pipeNo: string;
  pitch: string;
}

export interface MeasurementInput {
  pipeNo: string;
  pitch: string;
  /** 音分偏差，带符号 */
  cents: number;
  /** 摄氏温度 */
  temperature: number;
  /** 相对湿度百分比 */
  humidity: number;
  reed: ReedStatus;
  note?: string;
}

export type ReasonCode =
  | "temp_low"
  | "temp_high"
  | "humidity_high"
  | "cents_over"
  | "reed_abnormal"
  | "missing_measurement"
  | "env_blocked";

export interface Measurement extends MeasurementInput {
  id: string;
  batchId: string;
  venue: string;
  stop: string;
  recordedAt: number;
  kind: AttemptKind;
  /** 温湿度是否满足放行环境（10℃~30℃ 且 湿度≤70%） */
  envValid: boolean;
  envReasons: ReasonCode[];
  faultReasons: ReasonCode[];
  /** 复调接管时指向接管它的新记录 */
  supersededById?: string;
}

export type DecisionCode = "released" | "pending_retest" | "pending_review";

export interface ReleaseDecision {
  decision: DecisionCode;
  reasons: ReasonCode[];
  missing: string[];
  retestPipes: string[];
  faultPipes: string[];
  decidedAt: number;
}

export interface MaintenanceBatch {
  id: string;
  /** 维护批次单号，展示用 */
  code: string;
  venue: string;
  stop: string;
  /** 本批次该音栓计划测量的音管，缺测即整批待复核 */
  slots: PipeSlot[];
  /** 批次内全部测量尝试（含只读与待复测记录） */
  measurements: Measurement[];
  status: BatchStatus;
  createdAt: number;
  releasedAt: number | null;
  /** 最近一次申请放行的裁决，用于报告留痕 */
  lastDecision: ReleaseDecision | null;
  /** 放行瞬间冻结的快照，已放行批次以此为准，永不改变 */
  snapshot: Measurement[] | null;
}

/** 每根音管全工作台唯一的有效结果（放行快照接管而来） */
export interface EffectiveResult {
  pipeKey: string;
  venue: string;
  stop: string;
  pipeNo: string;
  measurement: Measurement;
  batchId: string;
  releasedAt: number;
}

/** 被复调成功后保留下来的上一条只读有效结果 */
export interface ArchivedResult {
  pipeKey: string;
  result: EffectiveResult;
  supersededByBatchId: string;
  supersededAt: number;
}

export interface TuningState {
  version: 1;
  batches: MaintenanceBatch[];
  /** pipeKey -> 当前唯一有效结果 */
  current: Record<string, EffectiveResult>;
  /** 被接管的历史有效结果，只读取档 */
  archive: ArchivedResult[];
}

/**
 * 管风琴调音「维护放行」领域模型
 *
 * 状态流转：
 *   测量（measurement）：valid（合格）/ retest（温湿度越限，待复测，不得放行）
 *   批次（batch）：recording（记录中）→ review（整批待复核）→ released（已放行）
 *   结果（result）：每根音管至多一条 readOnly=false 的有效结果；
 *                  复调放行后旧结果置为只读历史，新结果接管。
 */

export type ReedStatus = "normal" | "abnormal";

/** 单次测量的环境判定结果 */
export type MeasurementState = "valid" | "retest";

export type BatchStatus = "recording" | "review" | "released";

/** 批次覆盖的音栓目标（场馆 + 音栓） */
export interface StopTarget {
  venue: string;
  stop: string;
}

/** 音管档案 */
export interface Pipe {
  key: string;
  venue: string;
  stop: string;
  pipeNo: string;
  pitch: string;
  /** 是否簧片音栓（需要记录簧片状态） */
  reedStop: boolean;
}

export type IssueCode = "cent" | "reed" | "missing" | "environment";

/** 放行校验发现的问题 */
export interface GateIssue {
  code: IssueCode;
  pipeKey?: string;
  message: string;
}

/** 批次内对某根音管的一次测量（同一音管同批次重复测量只保留最后一条） */
export interface Measurement {
  id: string;
  pipeKey: string;
  cents: number;
  temperature: number;
  humidity: number;
  reed: ReedStatus;
  note: string;
  /** valid=可参与放行；retest=本次只记待复测 */
  state: MeasurementState;
  envReasons: string[];
  measuredAt: string;
}

/** 已放行的音管结果（含被接管的只读历史记录） */
export interface ResultRecord {
  id: string;
  pipeKey: string;
  cents: number;
  temperature: number;
  humidity: number;
  reed: ReedStatus;
  note: string;
  batchId: string;
  batchName: string;
  releasedAt: string;
  /** true=已被复调结果接管的只读记录 */
  readOnly: boolean;
  supersededBy?: string;
  supersededAt?: string;
}

/** 放行成功时刻生成的不可变批次快照中的单行 */
export interface SnapshotRow {
  pipeKey: string;
  cents: number;
  reed: ReedStatus;
  /** 被本次放行接管的上一条结果 id（只读归档来源） */
  supersededId?: string;
}

/** 放行成功时刻的批次快照（一旦生成不再变更） */
export interface BatchSnapshot {
  id: string;
  releasedAt: string;
  measuredCount: number;
  archivedCount: number;
  rows: SnapshotRow[];
}

/** 一次放行校验的留痕（成功/失败都记录，便于复核） */
export interface GateRecord {
  at: string;
  releasable: boolean;
  hard: GateIssue[];
  retest: GateIssue[];
}

export interface MaintenanceBatch {
  id: string;
  name: string;
  targets: StopTarget[];
  createdAt: string;
  status: BatchStatus;
  measurements: Measurement[];
  snapshots: BatchSnapshot[];
  releasedAt?: string;
  lastGate?: GateRecord;
}

export interface AppState {
  version: 1;
  pipes: Pipe[];
  batches: MaintenanceBatch[];
  /** 全部已放行结果（含只读历史）；每根音管至多一条 readOnly=false */
  results: ResultRecord[];
  activeBatchId: string;
}

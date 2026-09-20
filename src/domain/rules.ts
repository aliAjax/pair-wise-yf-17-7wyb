/**
 * 规则校验（纯函数，不触碰存储与视图）：
 * - 环境闸门：温度 <10℃ 或 >30℃、湿度 >70% 时测量只记为待复测，不得放行
 * - 硬缺陷：音分偏差绝对值 >8、簧片异常
 * - 同一音栓缺测：整批待复核
 * - 复调接管：同一音管的旧当前记录转只读，新记录接管；待复测记录不接管
 */

import type {
  BatchStatus,
  DecisionCode,
  MaintenanceBatch,
  Measurement,
  MeasurementInput,
  PipeSlot,
  ReasonCode,
  ReleaseDecision,
} from "./types";

export const TEMP_MIN = 10;
export const TEMP_MAX = 30;
export const HUMIDITY_MAX = 70;
export const CENT_LIMIT = 8;

/** 音管在全工作台的唯一标识键：场馆 / 音栓 / 音管编号 */
export function pipeKey(venue: string, stop: string, pipeNo: string): string {
  return `${venue} / ${stop} / ${pipeNo}`;
}

export function environmentReasons(
  temperature: number,
  humidity: number,
): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  if (temperature < TEMP_MIN) reasons.push("temp_low");
  if (temperature > TEMP_MAX) reasons.push("temp_high");
  if (humidity > HUMIDITY_MAX) reasons.push("humidity_high");
  return reasons;
}

export function faultReasons(
  cents: number,
  reed: Measurement["reed"],
): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  if (Math.abs(cents) > CENT_LIMIT) reasons.push("cents_over");
  if (reed === "abnormal") reasons.push("reed_abnormal");
  return reasons;
}

/** 批次内当前候选记录（排除只读历史） */
export function liveMeasurements(measurements: Measurement[]): Measurement[] {
  return measurements.filter((m) => m.kind !== "readonly");
}

export interface BatchEvaluation {
  decision: DecisionCode;
  status: BatchStatus;
  missing: string[];
  retestPipes: string[];
  faultPipes: string[];
  reasons: ReasonCode[];
}

/**
 * 评估一个未放行批次（以每管最新一条非只读尝试为准）：
 * 1) 缺测 / 硬缺陷 -> 待复核（整批，旧结果与快照不变）
 * 2) 仅环境受限 -> 待复测
 * 3) 全部满足 -> 可放行
 */
export function evaluateBatch(batch: MaintenanceBatch): BatchEvaluation {
  const missing: string[] = [];
  const byPipe = new Map<string, Measurement>();
  for (const m of liveMeasurements(batch.measurements)) {
    const key = m.pipeNo;
    const prev = byPipe.get(key);
    if (!prev || m.recordedAt >= prev.recordedAt) byPipe.set(key, m);
  }
  for (const slot of batch.slots) {
    if (!byPipe.has(slot.pipeNo)) missing.push(slot.pipeNo);
  }

  const retestPipes: string[] = [];
  const faultPipes: string[] = [];
  const reasons: ReasonCode[] = [];

  for (const m of byPipe.values()) {
    if (m.faultReasons.length > 0) {
      faultPipes.push(m.pipeNo);
      for (const r of m.faultReasons) if (!reasons.includes(r)) reasons.push(r);
    }
    if (!m.envValid) {
      retestPipes.push(m.pipeNo);
      if (!reasons.includes("env_blocked")) reasons.push("env_blocked");
    }
  }
  if (missing.length > 0 && !reasons.includes("missing_measurement")) {
    reasons.push("missing_measurement");
  }

  if (missing.length > 0 || faultPipes.length > 0) {
    return { decision: "pending_review", status: "pending_review", missing, retestPipes, faultPipes, reasons };
  }
  if (retestPipes.length > 0) {
    return { decision: "pending_retest", status: "pending_retest", missing, retestPipes, faultPipes, reasons };
  }
  return { decision: "released", status: "released", missing, retestPipes, faultPipes, reasons };
}

export function buildDecision(batch: MaintenanceBatch, decidedAt: number): ReleaseDecision {
  const e = evaluateBatch(batch);
  return {
    decision: e.decision,
    reasons: e.reasons,
    missing: e.missing,
    retestPipes: e.retestPipes,
    faultPipes: e.faultPipes,
    decidedAt,
  };
}

/** 放行快照：每根音管仅保留最新一条可放行记录（env 合法且无硬缺陷） */
export function releaseSnapshot(measurements: Measurement[]): Measurement[] {
  const chosen = new Map<string, Measurement>();
  for (const m of liveMeasurements(measurements)) {
    if (!m.envValid || m.faultReasons.length > 0) continue;
    const prev = chosen.get(m.pipeNo);
    if (!prev || m.recordedAt >= prev.recordedAt) chosen.set(m.pipeNo, m);
  }
  return [...chosen.values()].sort((a, b) => a.pipeNo.localeCompare(b.pipeNo));
}

/**
 * 复调录入：
 * - 新记录环境合法（current）：同管旧的当前记录转为只读并指向新记录，由新记录接管；
 *   旧待复测记录保留原样留痕。
 * - 新记录环境超限（retest）：只追加待复测记录，不动任何旧记录（不接管）。
 */
export function applyRetake(
  measurements: Measurement[],
  next: Measurement,
): Measurement[] {
  if (next.kind !== "current") {
    return [...measurements, next];
  }
  const result: Measurement[] = [];
  for (const m of measurements) {
    if (m.pipeNo === next.pipeNo && m.kind === "current") {
      result.push({ ...m, kind: "readonly", supersededById: next.id });
    } else {
      result.push(m);
    }
  }
  result.push(next);
  return result;
}

export function describeMeasurement(
  input: Pick<MeasurementInput, "temperature" | "humidity" | "cents" | "reed">,
): { envReasons: ReasonCode[]; faultReasons: ReasonCode[]; envValid: boolean } {
  const envReasons = environmentReasons(input.temperature, input.humidity);
  return {
    envReasons,
    envValid: envReasons.length === 0,
    faultReasons: faultReasons(input.cents, input.reed),
  };
}

/** 批量计划音管的辅助构造 */
export function slotsFrom(rows: Array<[string, string]>): PipeSlot[] {
  return rows.map(([pipeNo, pitch]) => ({ pipeNo, pitch }));
}

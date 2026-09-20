/**
 * 报告视图模型（纯计算）：单次维护报告、异常统计、导出序列化。
 * 不渲染 DOM；由 src/ui 组件消费。
 */

import {
  CENT_LIMIT,
  HUMIDITY_MAX,
  TEMP_MAX,
  TEMP_MIN,
  evaluateBatch,
} from "../domain/rules";
import { latestAttempts } from "./storage";
import type {
  MaintenanceBatch,
  Measurement,
  ReasonCode,
  TuningState,
} from "../domain/types";

export const REASON_TEXT: Record<ReasonCode, string> = {
  temp_low: `温度低于${TEMP_MIN}℃`,
  temp_high: `温度高于${TEMP_MAX}℃`,
  humidity_high: `湿度高于${HUMIDITY_MAX}%`,
  cents_over: `音分偏差超过${CENT_LIMIT}音分`,
  reed_abnormal: "簧片状态异常",
  missing_measurement: "同一音栓缺少测量结果",
  env_blocked: "温湿度超出放行环境，待复测",
};

export const BATCH_STATUS_TEXT = {
  open: "进行中",
  pending_retest: "待复测",
  pending_review: "待复核",
  released: "已放行",
} as const;

export const ATTEMPT_KIND_TEXT = {
  current: "当前",
  readonly: "只读",
  retest: "待复测",
} as const;

export interface PipeReportRow {
  slot: { pipeNo: string; pitch: string };
  measurement: Measurement | null;
  missing: boolean;
  envBlocked: boolean;
  faults: ReasonCode[];
  reasons: ReasonCode[];
}

export interface MaintenanceReport {
  batch: MaintenanceBatch;
  rows: PipeReportRow[];
  status: MaintenanceBatch["status"];
  decision: MaintenanceBatch["lastDecision"];
  measuredCount: number;
  missingCount: number;
  retestCount: number;
  faultCount: number;
  releasedCount: number;
  maxAbsCents: number;
  summary: string;
}

/** 单次维护报告 */
export function buildBatchReport(batch: MaintenanceBatch): MaintenanceReport {
  const attempts = latestAttempts(batch);
  const rows: PipeReportRow[] = batch.slots.map((slot) => {
    const m = attempts.get(slot.pipeNo) ?? null;
    const faults = m ? m.faultReasons : [];
    const envBlocked = m ? !m.envValid : false;
    const reasons: ReasonCode[] = [];
    if (!m) reasons.push("missing_measurement");
    if (m && !m.envValid) reasons.push("env_blocked");
    for (const f of faults) if (!reasons.includes(f)) reasons.push(f);
    return { slot, measurement: m, missing: !m, envBlocked, faults, reasons };
  });

  const measuredCount = rows.filter((r) => r.measurement).length;
  const missingCount = rows.filter((r) => r.missing).length;
  const retestCount = rows.filter((r) => r.envBlocked).length;
  const faultCount = rows.filter((r) => r.faults.length > 0).length;
  const releasedCount = batch.snapshot?.length ?? 0;
  const maxAbsCents = rows.reduce(
    (max, r) => (r.measurement ? Math.max(max, Math.abs(r.measurement.cents)) : max),
    0,
  );

  const evaluation = evaluateBatch(batch);
  const status = batch.status === "released" ? "released" : evaluation.status;

  let summary: string;
  if (status === "released") {
    summary = `本批次 ${releasedCount} 根音管测量结果合格，已维护放行。`;
  } else if (status === "pending_review") {
    summary = "偏差超限、簧片异常或音栓缺测，整批保持待复核，旧结果与快照不变。";
  } else {
    summary = "温湿度超出放行环境，本次测量只记为待复测，待环境恢复后复测。";
  }

  return {
    batch,
    rows,
    status,
    decision: batch.lastDecision,
    measuredCount,
    missingCount,
    retestCount,
    faultCount,
    releasedCount,
    maxAbsCents,
    summary,
  };
}

export interface ExceptionStats {
  batchTotal: number;
  releasedBatchCount: number;
  pendingReviewCount: number;
  pendingRetestCount: number;
  openCount: number;
  currentPipeCount: number;
  archivedCount: number;
  exceptionPipeCount: number;
  centsFaultPipes: string[];
  reedFaultPipes: string[];
  envRetestPipes: string[];
  missingBatches: Array<{ batchId: string; label: string; pipes: string[] }>;
}

/** 工作台异常统计：跨批次的待复核、待复测与缺测 */
export function buildExceptionStats(state: TuningState): ExceptionStats {
  const centsFaultPipes = new Set<string>();
  const reedFaultPipes = new Set<string>();
  const envRetestPipes = new Set<string>();
  const missingBatches: ExceptionStats["missingBatches"] = [];

  let pendingReviewCount = 0;
  let pendingRetestCount = 0;

  for (const batch of state.batches) {
    if (batch.status === "released") continue;
    const report = buildBatchReport(batch);
    if (report.status === "pending_review") pendingReviewCount += 1;
    if (report.status === "pending_retest") pendingRetestCount += 1;
    for (const row of report.rows) {
      const label = `${batch.venue} · ${batch.stop} · ${row.slot.pipeNo}`;
      if (row.faults.includes("cents_over")) centsFaultPipes.add(label);
      if (row.faults.includes("reed_abnormal")) reedFaultPipes.add(label);
      if (row.envBlocked) envRetestPipes.add(label);
    }
    if (report.missingCount > 0) {
      missingBatches.push({
        batchId: batch.id,
        label: `${batch.venue} · ${batch.stop}（${batch.code}）`,
        pipes: report.rows.filter((r) => r.missing).map((r) => r.slot.pipeNo),
      });
    }
  }

  const exceptionPipeCount =
    centsFaultPipes.size +
    reedFaultPipes.size +
    envRetestPipes.size +
    missingBatches.reduce((n, b) => n + b.pipes.length, 0);

  return {
    batchTotal: state.batches.length,
    releasedBatchCount: state.batches.filter((b) => b.status === "released").length,
    pendingReviewCount,
    pendingRetestCount,
    openCount: state.batches.filter((b) => b.status === "open").length,
    currentPipeCount: Object.keys(state.current).length,
    archivedCount: state.archive.length,
    exceptionPipeCount,
    centsFaultPipes: [...centsFaultPipes],
    reedFaultPipes: [...reedFaultPipes],
    envRetestPipes: [...envRetestPipes],
    missingBatches,
  };
}

/** 报告导出（JSON，不引入新依赖） */
export function serializeReport(report: MaintenanceReport): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      batchCode: report.batch.code,
      venue: report.batch.venue,
      stop: report.batch.stop,
      status: BATCH_STATUS_TEXT[report.status],
      summary: report.summary,
      measuredCount: report.measuredCount,
      missingCount: report.missingCount,
      retestCount: report.retestCount,
      faultCount: report.faultCount,
      releasedCount: report.releasedCount,
      maxAbsCents: report.maxAbsCents,
      decision: report.decision,
      pipes: report.rows.map((r) => ({
        pipeNo: r.slot.pipeNo,
        pitch: r.slot.pitch,
        measurement: r.measurement,
        reasons: r.reasons.map((code) => REASON_TEXT[code]),
      })),
    },
    null,
    2,
  );
}

export function downloadReport(report: MaintenanceReport): void {
  const blob = new Blob([serializeReport(report)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.batch.code}-maintenance-report.json`;
  a.click();
  URL.revokeObjectURL(url);
}

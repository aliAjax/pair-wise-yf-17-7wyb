import type {
  AppState,
  BatchSnapshot,
  MaintenanceBatch,
  Pipe,
  ResultRecord,
} from "../types";
import {
  RULES,
  assessBatch,
  expectedPipes,
  latestMeasurement,
  isCentOverLimit,
} from "./rules";

/**
 * 报告视图模块：只从已持久化的状态派生「单次维护报告」与「异常统计」，
 * 自身不产生任何写入。视图组件只负责渲染这里的数据结构。
 */

export interface ReportRow {
  pipe: Pipe;
  cents: number;
  temperature: number;
  humidity: number;
  reedNormal: boolean;
  note: string;
  overCent: boolean;
  reedAbnormal: boolean;
  environmentBlocked: boolean;
  envReasons: string[];
  missing: boolean;
  retest: boolean;
  /** 放行后接管的上一条只读结果 */
  supersededResult?: ResultRecord;
}

export interface MaintenanceReport {
  batch: MaintenanceBatch;
  status: MaintenanceBatch["status"];
  releasable: boolean;
  rows: ReportRow[];
  snapshot?: BatchSnapshot;
  counts: {
    total: number;
    measured: number;
    missing: number;
    retest: number;
    overCent: number;
    reedAbnormal: number;
    passable: number;
  };
}

function supersededFor(
  state: AppState,
  batchId: string,
  pipeKey: string
): ResultRecord | undefined {
  // 已放行批次：从当次快照找到被接管的只读结果
  const batch = state.batches.find((b) => b.id === batchId);
  const snapshot = batch?.snapshots[batch.snapshots.length - 1];
  const row = snapshot?.rows.find((r) => r.pipeKey === pipeKey);
  if (row?.supersededId) {
    const old = state.results.find((r) => r.id === row.supersededId);
    if (old) return old;
  }
  return undefined;
}

/** 生成单个维护批次的报告（未放行按当前测量实时派生，已放行以快照为准） */
export function buildReport(state: AppState, batchId: string): MaintenanceReport | null {
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch) return null;

  const expected = expectedPipes(state.pipes, batch);
  const outcome = assessBatch(state.pipes, batch);
  const rows: ReportRow[] = expected.map((pipe) => {
    const m = latestMeasurement(batch, pipe.key);
    const missing = !m;
    const retest = m?.state === "retest";
    const overCent = !!m && m.state === "valid" && isCentOverLimit(m.cents);
    const reedAbnormal = !!m && m.state === "valid" && pipe.reedStop && m.reed === "abnormal";
    return {
      pipe,
      cents: m?.cents ?? 0,
      temperature: m?.temperature ?? 0,
      humidity: m?.humidity ?? 0,
      reedNormal: m ? m.reed === "normal" : true,
      note: m?.note ?? "",
      overCent,
      reedAbnormal,
      environmentBlocked: retest,
      envReasons: m?.envReasons ?? [],
      missing,
      retest,
      supersededResult: batch.status === "released" ? supersededFor(state, batch.id, pipe.key) : undefined,
    };
  });

  const counts = {
    total: rows.length,
    measured: rows.filter((r) => !r.missing).length,
    missing: rows.filter((r) => r.missing).length,
    retest: rows.filter((r) => r.retest).length,
    overCent: rows.filter((r) => r.overCent).length,
    reedAbnormal: rows.filter((r) => r.reedAbnormal).length,
    passable: rows.filter((r) => !r.missing && !r.retest && !r.overCent && !r.reedAbnormal).length,
  };

  return {
    batch,
    status: batch.status,
    releasable: outcome.releasable,
    rows,
    snapshot: batch.snapshots[batch.snapshots.length - 1],
    counts,
  };
}

export interface AnomalySummary {
  overCentCurrent: number;
  reedAbnormalCurrent: number;
  pendingReviewBatches: number;
  pendingRetestPipes: number;
  missingBatches: number;
  releasedBatches: number;
  archivedResults: number;
  currentResults: number;
  overCentOpen: { pipe: Pipe; cents: number; batchName: string }[];
  retestOpen: { pipe: Pipe; reasons: string[]; batchName: string }[];
}

/** 全量异常统计：当前有效结果异常 + 未放行批次中的阻断项，与报告共享规则口径 */
export function summarizeAnomalies(state: AppState): AnomalySummary {
  const openBatches = state.batches.filter((b) => b.status !== "released");

  const overCentCurrent = state.results.filter(
    (r) => !r.readOnly && isCentOverLimit(r.cents)
  ).length;
  const reedAbnormalCurrent = state.results.filter(
    (r) => !r.readOnly && r.reed === "abnormal"
  ).length;

  const overCentOpen: AnomalySummary["overCentOpen"] = [];
  const retestOpen: AnomalySummary["retestOpen"] = [];

  for (const batch of openBatches) {
    for (const pipe of expectedPipes(state.pipes, batch)) {
      const m = latestMeasurement(batch, pipe.key);
      if (!m) continue;
      if (m.state === "retest") {
        retestOpen.push({ pipe, reasons: m.envReasons, batchName: batch.name });
      } else {
        if (isCentOverLimit(m.cents)) {
          overCentOpen.push({ pipe, cents: m.cents, batchName: batch.name });
        }
      }
    }
  }

  let missingBatches = 0;
  for (const batch of openBatches) {
    if (assessBatch(state.pipes, batch).hard.some((i) => i.code === "missing")) {
      missingBatches += 1;
    }
  }

  return {
    overCentCurrent,
    reedAbnormalCurrent,
    pendingReviewBatches: state.batches.filter((b) => b.status === "review").length,
    pendingRetestPipes: retestOpen.length,
    missingBatches,
    releasedBatches: state.batches.filter((b) => b.status === "released").length,
    archivedResults: state.results.filter((r) => r.readOnly).length,
    currentResults: state.results.filter((r) => !r.readOnly).length,
    overCentOpen,
    retestOpen,
  };
}

export const RULE_LABELS = {
  tempRange: `温度 ${RULES.temperatureMin}–${RULES.temperatureMax}℃`,
  humidity: `湿度 ≤${RULES.humidityMax}%`,
  cent: `|音分偏差| ≤ ${RULES.centLimit}`,
};

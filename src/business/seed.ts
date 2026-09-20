/** 首次打开时的演示数据：覆盖已放行、待复核、待复测与复调只读记录 */

import { describeMeasurement, pipeKey } from "../domain/rules";
import type {
  AttemptKind,
  MaintenanceBatch,
  Measurement,
  MeasurementInput,
  TuningState,
} from "../domain/types";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function measurement(
  seq: number,
  batch: { id: string; venue: string; stop: string },
  input: MeasurementInput,
  recordedAt: number,
  kind: AttemptKind = "current",
  supersededById?: string,
): Measurement {
  const d = describeMeasurement(input);
  return {
    ...input,
    id: `m-seed-${seq}`,
    batchId: batch.id,
    venue: batch.venue,
    stop: batch.stop,
    recordedAt,
    kind,
    envValid: d.envValid,
    envReasons: d.envReasons,
    faultReasons: d.faultReasons,
    supersededById,
  };
}

export function buildSeedState(): TuningState {
  const batches: MaintenanceBatch[] = [];

  // 1) St.Mary Trumpet 8'：已放行（15 天前），含一条被复调接管的只读记录
  const b1: MaintenanceBatch = {
    id: "b-seed-1",
    code: "WB-20260905-01",
    venue: "St.Mary",
    stop: "Trumpet 8'",
    slots: [
      { pipeNo: "C#4", pitch: "C#4" },
      { pipeNo: "E4", pitch: "E4" },
      { pipeNo: "G4", pitch: "G4" },
    ],
    measurements: [],
    status: "released",
    createdAt: now - 16 * DAY,
    releasedAt: now - 15 * DAY,
    lastDecision: null,
    snapshot: null,
  };
  b1.measurements = [
    measurement(1, b1, { pipeNo: "C#4", pitch: "C#4", cents: 9, temperature: 18, humidity: 55, reed: "normal", note: "旧记录：偏差超限" }, now - 16 * DAY, "readonly", "m-seed-2"),
    measurement(2, b1, { pipeNo: "C#4", pitch: "C#4", cents: 2, temperature: 18.5, humidity: 56, reed: "normal", note: "复调后合格" }, now - 15 * DAY, "current"),
    measurement(3, b1, { pipeNo: "E4", pitch: "E4", cents: -1, temperature: 18.6, humidity: 56, reed: "normal" }, now - 15 * DAY, "current"),
    measurement(4, b1, { pipeNo: "G4", pitch: "G4", cents: 3, temperature: 18.4, humidity: 57, reed: "normal" }, now - 15 * DAY, "current"),
  ];
  b1.snapshot = b1.measurements.filter((m) => m.kind === "current");
  b1.lastDecision = {
    decision: "released",
    reasons: [],
    missing: [],
    retestPipes: [],
    faultPipes: [],
    decidedAt: b1.releasedAt!,
  };
  batches.push(b1);

  // 2) ConcertHall A Principal 4'：已放行（60 天前），G3 后来被批次 3 复调接管
  const b2: MaintenanceBatch = {
    id: "b-seed-2",
    code: "WB-20260712-02",
    venue: "ConcertHall A",
    stop: "Principal 4'",
    slots: [
      { pipeNo: "G3", pitch: "G3" },
      { pipeNo: "A3", pitch: "A3" },
      { pipeNo: "B3", pitch: "B3" },
    ],
    measurements: [],
    status: "released",
    createdAt: now - 61 * DAY,
    releasedAt: now - 60 * DAY,
    lastDecision: null,
    snapshot: null,
  };
  b2.measurements = [
    measurement(5, b2, { pipeNo: "G3", pitch: "G3", cents: -3, temperature: 21, humidity: 50, reed: "normal", note: "正常" }, now - 60 * DAY, "current"),
    measurement(6, b2, { pipeNo: "A3", pitch: "A3", cents: 2, temperature: 21, humidity: 50, reed: "normal" }, now - 60 * DAY, "current"),
    measurement(7, b2, { pipeNo: "B3", pitch: "B3", cents: 4, temperature: 21, humidity: 51, reed: "normal" }, now - 60 * DAY, "current"),
  ];
  b2.snapshot = [...b2.measurements];
  b2.lastDecision = {
    decision: "released",
    reasons: [],
    missing: [],
    retestPipes: [],
    faultPipes: [],
    decidedAt: b2.releasedAt!,
  };
  batches.push(b2);

  // 3) 同一音栓复调批次，已放行（3 天前），接管 G3
  const b3: MaintenanceBatch = {
    id: "b-seed-3",
    code: "WB-20260917-03",
    venue: "ConcertHall A",
    stop: "Principal 4'",
    slots: [
      { pipeNo: "G3", pitch: "G3" },
      { pipeNo: "A3", pitch: "A3" },
      { pipeNo: "B3", pitch: "B3" },
    ],
    measurements: [],
    status: "released",
    createdAt: now - 4 * DAY,
    releasedAt: now - 3 * DAY,
    lastDecision: null,
    snapshot: null,
  };
  b3.measurements = [
    measurement(8, b3, { pipeNo: "G3", pitch: "G3", cents: -1, temperature: 20.5, humidity: 48, reed: "normal", note: "复调接管" }, now - 3 * DAY, "current"),
    measurement(9, b3, { pipeNo: "A3", pitch: "A3", cents: 1, temperature: 20.5, humidity: 48, reed: "normal" }, now - 3 * DAY, "current"),
    measurement(10, b3, { pipeNo: "B3", pitch: "B3", cents: 2, temperature: 20.5, humidity: 48, reed: "normal" }, now - 3 * DAY, "current"),
  ];
  b3.snapshot = [...b3.measurements];
  b3.lastDecision = {
    decision: "released",
    reasons: [],
    missing: [],
    retestPipes: [],
    faultPipes: [],
    decidedAt: b3.releasedAt!,
  };
  batches.push(b3);

  // 4) Abbey Room Bourdon 16'：进行中且存在缺测，申请放行将判为待复核
  const b4: MaintenanceBatch = {
    id: "b-seed-4",
    code: "WB-20260919-04",
    venue: "Abbey Room",
    stop: "Bourdon 16'",
    slots: [
      { pipeNo: "F2", pitch: "F2" },
      { pipeNo: "C2", pitch: "C2" },
      { pipeNo: "G2", pitch: "G2" },
    ],
    measurements: [],
    status: "open",
    createdAt: now - 1 * DAY,
    releasedAt: null,
    lastDecision: null,
    snapshot: null,
  };
  b4.measurements = [
    measurement(11, b4, { pipeNo: "F2", pitch: "F2", cents: -12, temperature: 17, humidity: 60, reed: "normal", note: "标记复检：偏差超限" }, now - 1 * DAY, "current"),
    measurement(12, b4, { pipeNo: "C2", pitch: "C2", cents: 1, temperature: 17, humidity: 60, reed: "normal" }, now - 1 * DAY, "current"),
  ];
  batches.push(b4);

  // 5) Chapel Hill Mixture V：待复核（簧片异常 + 偏差超限），快照保持空缺不变
  const b5: MaintenanceBatch = {
    id: "b-seed-5",
    code: "WB-20260918-05",
    venue: "Chapel Hill",
    stop: "Mixture V",
    slots: [
      { pipeNo: "D5", pitch: "D5" },
      { pipeNo: "F5", pitch: "F5" },
    ],
    measurements: [],
    status: "pending_review",
    createdAt: now - 2 * DAY,
    releasedAt: null,
    lastDecision: null,
    snapshot: null,
  };
  b5.measurements = [
    measurement(13, b5, { pipeNo: "D5", pitch: "D5", cents: 11, temperature: 22, humidity: 55, reed: "abnormal", note: "簧片状态异常" }, now - 2 * DAY, "current"),
    measurement(14, b5, { pipeNo: "F5", pitch: "F5", cents: 0, temperature: 22, humidity: 55, reed: "normal" }, now - 2 * DAY, "current"),
  ];
  b5.lastDecision = {
    decision: "pending_review",
    reasons: ["cents_over", "reed_abnormal"],
    missing: [],
    retestPipes: [],
    faultPipes: ["D5"],
    decidedAt: now - 2 * DAY,
  };
  batches.push(b5);

  // 6) City Hall Octave 2'：待复测（湿度 72% 超环境闸门）
  const b6: MaintenanceBatch = {
    id: "b-seed-6",
    code: "WB-20260919-06",
    venue: "City Hall",
    stop: "Octave 2'",
    slots: [
      { pipeNo: "C5", pitch: "C5" },
      { pipeNo: "E5", pitch: "E5" },
    ],
    measurements: [],
    status: "pending_retest",
    createdAt: now - 6 * 60 * 60 * 1000,
    releasedAt: null,
    lastDecision: null,
    snapshot: null,
  };
  b6.measurements = [
    measurement(15, b6, { pipeNo: "C5", pitch: "C5", cents: 2, temperature: 19, humidity: 72, reed: "normal", note: "高湿环境，待复测" }, b6.createdAt, "retest"),
    measurement(16, b6, { pipeNo: "E5", pitch: "E5", cents: -2, temperature: 19, humidity: 68, reed: "normal" }, b6.createdAt, "current"),
  ];
  b6.lastDecision = {
    decision: "pending_retest",
    reasons: ["env_blocked"],
    missing: [],
    retestPipes: ["C5"],
    faultPipes: [],
    decidedAt: now - 5 * 60 * 60 * 1000,
  };
  batches.push(b6);

  // 当前有效结果：按放行时间顺序接管（b3 接管 b2 的 G3，b2 旧记录入只读档）
  const current: TuningState["current"] = {};
  const archive: TuningState["archive"] = [];
  for (const b of [b1, b2, b3]) {
    for (const m of b.snapshot ?? []) {
      const key = pipeKey(b.venue, b.stop, m.pipeNo);
      const prev = current[key];
      if (prev) {
        archive.push({
          pipeKey: key,
          result: prev,
          supersededByBatchId: b.id,
          supersededAt: b.releasedAt ?? now,
        });
      }
      current[key] = {
        pipeKey: key,
        venue: b.venue,
        stop: b.stop,
        pipeNo: m.pipeNo,
        measurement: m,
        batchId: b.id,
        releasedAt: b.releasedAt ?? now,
      };
    }
  }

  return { version: 1, batches, current, archive };
}

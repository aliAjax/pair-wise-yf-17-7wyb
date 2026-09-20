import type {
  BatchStatus,
  GateIssue,
  MaintenanceBatch,
  Measurement,
  Pipe,
  StopTarget,
} from "../types";

/**
 * 规则校验模块：不读写存储、不触碰 UI，全部为纯函数。
 *
 * 放行红线：
 *  1. 温度 < 10℃ 或 > 30℃、湿度 > 70%：本次测量只记「待复测」，不得放行；
 *  2. 音分偏差 |cents| > 8：硬阻断，整批待复核；
 *  3. 簧片状态异常（簧片音栓）：硬阻断，整批待复核；
 *  4. 同一音栓缺少测量结果：硬阻断，整批待复核。
 * 硬阻断时旧结果与批次快照均保持不变。
 */

export const RULES = {
  temperatureMin: 10,
  temperatureMax: 30,
  humidityMax: 70,
  centLimit: 8,
} as const;

export function pipeKey(venue: string, stop: string, pipeNo: string): string {
  return `${venue} / ${stop} / ${pipeNo}`;
}

export function pipeOfTarget(pipes: Pipe[], t: StopTarget): Pipe[] {
  return pipes.filter((p) => p.venue === t.venue && p.stop === t.stop);
}

/** 批次应覆盖的全部音管（同一音栓缺测量即按此清单判定） */
export function expectedPipes(pipes: Pipe[], batch: MaintenanceBatch): Pipe[] {
  return batch.targets.flatMap((t) => pipeOfTarget(pipes, t));
}

export function evaluateEnvironment(
  temperature: number,
  humidity: number
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (temperature < RULES.temperatureMin) {
    reasons.push(`温度 ${temperature}℃ 低于 ${RULES.temperatureMin}℃`);
  }
  if (temperature > RULES.temperatureMax) {
    reasons.push(`温度 ${temperature}℃ 高于 ${RULES.temperatureMax}℃`);
  }
  if (humidity > RULES.humidityMax) {
    reasons.push(`湿度 ${humidity}% 高于 ${RULES.humidityMax}%`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function isCentOverLimit(cents: number): boolean {
  return Math.abs(cents) > RULES.centLimit;
}

/** 依据测量值计算本次测量应记录为 valid 还是「待复测」 */
export function classifyMeasurement(
  input: Pick<Measurement, "temperature" | "humidity">
): Pick<Measurement, "state" | "envReasons"> {
  const env = evaluateEnvironment(input.temperature, input.humidity);
  return {
    state: env.ok ? "valid" : "retest",
    envReasons: env.reasons,
  };
}

export interface GateOutcome {
  /** 能否放行：仅当无硬阻断且无待复测项时为 true */
  releasable: boolean;
  /** 硬阻断：触发整批「待复核」，旧结果 / 快照不变 */
  hard: GateIssue[];
  /** 环境越限：相关测量仅记待复测，不进入有效结果 */
  retest: GateIssue[];
  /** 放行后批次应处的状态 */
  nextStatus: BatchStatus;
}

/**
 * 维护放行闸门。
 * 硬阻断（超差 / 簧片异常 / 缺测）→ 整批待复核；
 * 仅环境越限 → 维持记录中，等复测；
 * 全部通过 → 可放行。
 */
export function assessBatch(pipes: Pipe[], batch: MaintenanceBatch): GateOutcome {
  const hard: GateIssue[] = [];
  const retest: GateIssue[] = [];
  const expected = expectedPipes(pipes, batch);
  const expectedKeys = new Set(expected.map((p) => p.key));

  // 以音管为键，仅保留该批次最后一条测量
  const latest = new Map<string, Measurement>();
  for (const m of batch.measurements) {
    if (expectedKeys.has(m.pipeKey)) latest.set(m.pipeKey, m);
  }

  for (const pipe of expected) {
    const m = latest.get(pipe.key);
    if (!m) {
      hard.push({
        code: "missing",
        pipeKey: pipe.key,
        message: `${pipe.venue} / ${pipe.stop}：音管 ${pipe.pipeNo}（${pipe.pitch}）缺少测量结果`,
      });
      continue;
    }
    if (m.state === "retest") {
      retest.push({
        code: "environment",
        pipeKey: pipe.key,
        message: `${pipe.pipeNo}（${pipe.pitch}）环境越限待复测：${m.envReasons.join("、")}`,
      });
      continue;
    }
    if (isCentOverLimit(m.cents)) {
      hard.push({
        code: "cent",
        pipeKey: pipe.key,
        message: `${pipe.pipeNo}（${pipe.pitch}）音分偏差 ${m.cents}，超过 ±${RULES.centLimit} 音分`,
      });
    }
    if (pipe.reedStop && m.reed === "abnormal") {
      hard.push({
        code: "reed",
        pipeKey: pipe.key,
        message: `${pipe.pipeNo}（${pipe.pitch}）簧片状态异常`,
      });
    }
  }

  let nextStatus: BatchStatus = "released";
  if (hard.length > 0) nextStatus = "review";
  else if (retest.length > 0) nextStatus = "recording";

  return { releasable: hard.length === 0 && retest.length === 0, hard, retest, nextStatus };
}

/** 该音管在本批次的最后一条测量（缺省返回 undefined） */
export function latestMeasurement(
  batch: MaintenanceBatch,
  pipeKey: string
): Measurement | undefined {
  let found: Measurement | undefined;
  for (const m of batch.measurements) {
    if (m.pipeKey === pipeKey) found = m;
  }
  return found;
}

/** 批次覆盖的音栓标签，如 "Trumpet 8' +2" */
export function describeTargets(batch: MaintenanceBatch): string {
  const stops = Array.from(new Set(batch.targets.map((t) => t.stop)));
  if (stops.length <= 2) return stops.join(" + ");
  return `${stops.slice(0, 2).join(" + ")} 等 ${stops.length} 个音栓`;
}

export const STATUS_LABEL: Record<BatchStatus, string> = {
  recording: "记录中",
  review: "待复核",
  released: "已放行",
};

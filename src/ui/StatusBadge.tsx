import type { AttemptKind, BatchStatus, ReasonCode } from "../domain/types";
import {
  ATTEMPT_KIND_TEXT,
  BATCH_STATUS_TEXT,
  REASON_TEXT,
} from "../business/report";

const STATUS_CLASS: Record<BatchStatus, string> = {
  open: "badge badge-open",
  pending_retest: "badge badge-retest",
  pending_review: "badge badge-review",
  released: "badge badge-released",
};

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return <span className={STATUS_CLASS[status]}>{BATCH_STATUS_TEXT[status]}</span>;
}

const KIND_CLASS: Record<AttemptKind, string> = {
  current: "tag tag-current",
  readonly: "tag tag-readonly",
  retest: "tag tag-retest",
};

export function AttemptKindTag({ kind }: { kind: AttemptKind }) {
  return <span className={KIND_CLASS[kind]}>{ATTEMPT_KIND_TEXT[kind]}</span>;
}

export function ReasonTags({ reasons }: { reasons: ReasonCode[] }) {
  if (reasons.length === 0) return <span className="muted">—</span>;
  return (
    <span className="reason-tags">
      {reasons.map((r) => (
        <em key={r} className={r.startsWith("temp") || r === "humidity_high" || r === "env_blocked" ? "reason reason-env" : "reason reason-fault"}>
          {REASON_TEXT[r]}
        </em>
      ))}
    </span>
  );
}

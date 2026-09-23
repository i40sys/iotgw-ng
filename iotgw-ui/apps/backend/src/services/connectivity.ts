/**
 * Device connectivity check (decision-030): a Kestra `connectivity-check`
 * execution that, from the runner pod, pings the gateway FROM the Netmaker
 * host and then runs Ansible over SSH through the iotgw-jump bastion.
 *
 * The check takes tens of seconds, so it is exposed as start + progress: the
 * UI starts it, then polls `readConnectivityProgress`, which turns the
 * execution's state and its `IOTGW_PHASE <id>` log markers into a phase
 * timeline — the operator sees *what* is being waited for, not a spinner.
 */

const KESTRA_API_URL = (
  process.env.KESTRA_API_URL ?? "http://kestra.kestra.svc.cluster.local:8080"
).replace(/\/+$/, "");

function kestraAuth(): Record<string, string> {
  return {
    Authorization:
      "Basic " +
      Buffer.from(
        `${process.env.KESTRA_USER}:${process.env.KESTRA_PASSWORD}`,
      ).toString("base64"),
  };
}

export interface ConnectivityRequest {
  targetIp: string;
  deviceId: string;
  deviceName: string;
  pkiZone: string;
}

/** Start a connectivity-check execution; returns its Kestra execution id. */
export async function startConnectivityCheck(
  req: ConnectivityRequest,
): Promise<string> {
  const formData = new FormData();
  formData.append(
    "json_data",
    JSON.stringify({
      target_ip: req.targetIp,
      device_id: req.deviceId,
      device_name: req.deviceName,
      pki_zone: req.pkiZone,
    }),
  );
  const response = await fetch(
    `${KESTRA_API_URL}/api/v1/main/executions/iotgw-ng/connectivity-check`,
    { method: "POST", headers: kestraAuth(), body: formData },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to start connectivity check: ${response.status} ${response.statusText}. ${await response.text()}`,
    );
  }
  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new Error("Kestra did not return an execution id");
  return data.id;
}

export type PhaseStatus = "pending" | "running" | "done" | "failed";

export interface Phase {
  id: string;
  label: string;
  status: PhaseStatus;
  startedAt?: string;
  durationMs?: number;
}

export interface CheckResult {
  success: boolean;
  error: string;
  rawOutput: string;
}

export interface ConnectivityProgress {
  executionId: string;
  state: string;
  finished: boolean;
  startedAt?: string;
  elapsedMs: number;
  phases: Phase[];
  /** The most recent meaningful runner log line — "what is happening now". */
  lastLog?: string;
  /** Known as soon as the ICMP step has run, before the check finishes. */
  ping?: CheckResult & { latency?: number };
  /** Known when the execution has finished. */
  ansible?: CheckResult;
  success?: boolean;
}

/**
 * The phases, in order. Every id except the first two matches an
 * `IOTGW_PHASE <id>` marker echoed by the flow's runner script
 * (i40sys/iotgw-kestra connectivity-check-flow.yaml).
 */
const PHASES: Array<{ id: string; label: string }> = [
  { id: "queued", label: "Queued in Kestra" },
  { id: "runner", label: "Starting the runner pod" },
  { id: "fetch-playbooks", label: "Fetching the playbooks" },
  { id: "install-tools", label: "Installing runner tools" },
  { id: "mint-cert", label: "Minting a short-lived SSH certificate" },
  { id: "icmp", label: "ICMP ping from the Netmaker host" },
  { id: "ssh", label: "SSH + Ansible through the bastion" },
  { id: "done", label: "Collecting the results" },
];

interface KestraTaskRun {
  taskId: string;
  state?: { current?: string; startDate?: string; histories?: Array<{ date: string }> };
}
interface KestraExecution {
  state?: { current?: string; startDate?: string; endDate?: string };
  taskRunList?: KestraTaskRun[];
}
interface KestraLog {
  timestamp: string;
  message?: string;
}

const FINAL_STATES = new Set(["SUCCESS", "FAILED", "WARNING", "KILLED", "CANCELLED"]);
// Plugin chatter that says nothing to an operator.
const NOISE = /^(Received |Fetching final logs|Pod '.*' is (created|deleted)|\s*$)/;

function parseIcmp(lines: string[]): (CheckResult & { latency?: number }) | undefined {
  const marker = lines.find((l) => l.includes("ICMP_RESULT rc="));
  if (!marker) return undefined;
  const rawOutput = lines
    .filter((l) => /PING |bytes from|packet loss|rtt |iotgw-jump/.test(l))
    .join("\n");
  const rtt = rawOutput.match(/rtt [^=]+= [\d.]+\/([\d.]+)\//);
  const ok = /ICMP_RESULT rc=0\b/.test(marker);
  return {
    success: ok,
    error: ok ? "" : `ICMP from the Netmaker host failed (${marker.trim()})`,
    rawOutput,
    latency: rtt ? parseFloat(rtt[1]) : undefined,
  };
}

/** Read an execution and turn it into a phase timeline + results so far. */
export async function readConnectivityProgress(
  executionId: string,
): Promise<ConnectivityProgress> {
  const [execRes, logsRes] = await Promise.all([
    fetch(`${KESTRA_API_URL}/api/v1/main/executions/${executionId}`, { headers: kestraAuth() }),
    fetch(`${KESTRA_API_URL}/api/v1/main/logs/${executionId}`, { headers: kestraAuth() }),
  ]);
  if (!execRes.ok) {
    throw new Error(`Cannot read execution ${executionId}: HTTP ${execRes.status}`);
  }
  const exec = (await execRes.json()) as KestraExecution;
  const logs: KestraLog[] = logsRes.ok ? ((await logsRes.json()) as KestraLog[]) : [];
  const state = exec.state?.current ?? "CREATED";
  const finished = FINAL_STATES.has(state);
  const startedAt = exec.state?.startDate;
  const endedAt = finished ? exec.state?.endDate : undefined;
  const now = Date.now();

  // Phase start times: execution start, runner task start, then markers.
  const starts = new Map<string, string>();
  if (startedAt) starts.set("queued", startedAt);
  const runTask = exec.taskRunList?.find((t) => t.taskId === "run_connectivity_check");
  const runStart = runTask?.state?.histories?.[0]?.date ?? runTask?.state?.startDate;
  if (runStart) starts.set("runner", runStart);

  const lines: string[] = [];
  let lastLog: string | undefined;
  for (const entry of logs) {
    for (const line of (entry.message ?? "").split("\n")) {
      lines.push(line);
      const m = line.match(/^IOTGW_PHASE ([a-z-]+)/);
      if (m) {
        // `runner-started` closes the pod start-up phase.
        const id = m[1] === "runner-started" ? "fetch-playbooks" : m[1];
        if (!starts.has(id)) starts.set(id, entry.timestamp);
      } else if (!NOISE.test(line) && !line.startsWith("\t") && line.length < 200) {
        lastLog = line.trim();
      }
    }
  }

  // The furthest phase reached is the current one.
  let current = 0;
  PHASES.forEach((p, i) => {
    if (starts.has(p.id)) current = i;
  });
  const failed = finished && state !== "SUCCESS";
  const phases: Phase[] = PHASES.map((p, i) => {
    const start = starts.get(p.id);
    const nextStart = PHASES.slice(i + 1).map((n) => starts.get(n.id)).find(Boolean);
    const end = nextStart ?? (i === current ? endedAt : undefined);
    let status: PhaseStatus = "pending";
    if (i < current) status = "done";
    else if (i === current) status = finished ? (failed ? "failed" : "done") : "running";
    const durationMs = start
      ? (end ? Date.parse(end) : now) - Date.parse(start)
      : undefined;
    return { id: p.id, label: p.label, status, startedAt: start, durationMs };
  });

  const progress: ConnectivityProgress = {
    executionId,
    state,
    finished,
    startedAt,
    elapsedMs: startedAt ? (endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt) : 0,
    phases,
    lastLog,
    ping: parseIcmp(lines),
  };

  if (finished) {
    const ok = state === "SUCCESS" && runTask?.state?.current === "SUCCESS";
    progress.ansible = {
      success: ok,
      error: ok
        ? ""
        : `SSH/Ansible check failed (execution ${state.toLowerCase()}, task ${runTask?.state?.current ?? "not run"}) — see the execution logs`,
      rawOutput: lines.filter((l) => /fatal:|UNREACHABLE|ok: \[|PLAY RECAP/.test(l)).join("\n"),
    };
    progress.ping ??= {
      success: false,
      error: "The ICMP check did not run (no ICMP_RESULT in the execution logs)",
      rawOutput: "",
    };
    progress.success = progress.ping.success && progress.ansible.success;
  }
  return progress;
}

/** Step-by-step progress of one user operation (activate, send, withdraw…). */
export type StepStatus = "todo" | "active" | "done" | "error";
export type StepId = "keys" | "prepare" | "sign" | "confirm";
export type Step = { id: StepId; label: string; status: StepStatus; detail?: string };

export type Operation = {
  title: string;
  steps: Step[];
  signatures: string[];
  status: "running" | "done" | "error";
  error?: string;
  summary?: string;
};

export const STEP_LABELS: Record<StepId, string> = {
  keys: "Unlock encryption keys",
  prepare: "Encrypt and generate proofs",
  sign: "Approve in your wallet",
  confirm: "Confirm on Solana",
};

/** Handle given to actions so they can report progress without knowing the UI. */
export type OpContext = {
  /** Marks the current active step done and activates `id`. */
  step(id: StepId, detail?: string): void;
  /** Updates the detail line of a step. */
  detail(id: StepId, detail: string): void;
  /** Marks a step done immediately (e.g. keys already unlocked). */
  skip(id: StepId, detail: string): void;
  signature(sig: string): void;
};

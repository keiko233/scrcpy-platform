import type {
  FlowRunDto,
  FlowRunLogEntryDto,
  ResumeFlowRunInput,
  ResumeFlowRunResult,
  StartFlowRunInput,
  StartFlowRunResult,
  StopFlowRunInput,
  StopFlowRunResult,
} from "../../shared/run-contracts";
import type { ScreenRef } from "../../shared/window-contracts";
import type { FlowRuntimeService } from "./flow-runtime";

export type RunListener = (screenInstanceId: string, run: FlowRunDto) => void;
export type RunLogListener = (
  screenInstanceId: string,
  entry: FlowRunLogEntryDto,
) => void;

interface RegisteredRuntime {
  ref: ScreenRef;
  runtime: FlowRuntimeService;
  removeRun: () => void;
  removeLogs: () => void;
}

/** Routes run operations by screen instance rather than renderer focus. */
export class RunRegistry {
  readonly #runtimes = new Map<string, RegisteredRuntime>();
  readonly #runListeners = new Set<RunListener>();
  readonly #logListeners = new Set<RunLogListener>();

  register(ref: ScreenRef, runtime: FlowRuntimeService): void {
    this.unregister(ref.screenInstanceId);
    const removeRun = runtime.subscribe((run) => {
      for (const listener of this.#runListeners) {
        listener(ref.screenInstanceId, run);
      }
    });
    const removeLogs = runtime.subscribeLogs((entry) => {
      for (const listener of this.#logListeners) {
        listener(ref.screenInstanceId, entry);
      }
    });
    this.#runtimes.set(ref.screenInstanceId, {
      ref,
      runtime,
      removeRun,
      removeLogs,
    });
  }

  unregister(screenInstanceId: string): void {
    const registered = this.#runtimes.get(screenInstanceId);
    if (registered === undefined) {
      return;
    }
    registered.removeRun();
    registered.removeLogs();
    this.#runtimes.delete(screenInstanceId);
  }

  subscribe(listener: RunListener): () => void {
    this.#runListeners.add(listener);
    return () => this.#runListeners.delete(listener);
  }

  subscribeLogs(listener: RunLogListener): () => void {
    this.#logListeners.add(listener);
    return () => this.#logListeners.delete(listener);
  }

  getRuntime(screenInstanceId: string): FlowRuntimeService | null {
    return this.#runtimes.get(screenInstanceId)?.runtime ?? null;
  }

  getRef(screenInstanceId: string): ScreenRef | null {
    return this.#runtimes.get(screenInstanceId)?.ref ?? null;
  }

  getRun(screenInstanceId: string): FlowRunDto | null {
    return this.getRuntime(screenInstanceId)?.getRun() ?? null;
  }

  findByRunId(runId: string): { screenInstanceId: string; runtime: FlowRuntimeService } | null {
    for (const [screenInstanceId, registered] of this.#runtimes) {
      if (registered.runtime.getRun()?.runId === runId) {
        return { screenInstanceId, runtime: registered.runtime };
      }
    }
    return null;
  }

  start(screenInstanceId: string, input: StartFlowRunInput): StartFlowRunResult {
    return this.getRuntime(screenInstanceId)?.start(input) ?? {
      status: "error",
      error: "session-mismatch",
    };
  }

  stop(screenInstanceId: string, input: StopFlowRunInput): Promise<StopFlowRunResult> {
    return this.getRuntime(screenInstanceId)?.stop(input) ??
      Promise.resolve({ status: "error", error: "run-not-found" });
  }

  resume(screenInstanceId: string, input: ResumeFlowRunInput): ResumeFlowRunResult {
    return this.getRuntime(screenInstanceId)?.resume(input) ?? {
      status: "error",
      error: "run-not-found",
    };
  }

  async dispose(): Promise<void> {
    const registered = [...this.#runtimes.values()];
    this.#runtimes.clear();
    await Promise.allSettled(registered.map(({ runtime, removeRun, removeLogs }) => {
      removeRun();
      removeLogs();
      return runtime.dispose();
    }));
    this.#runListeners.clear();
    this.#logListeners.clear();
  }
}

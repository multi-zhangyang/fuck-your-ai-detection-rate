import { stringifyError } from "@/lib/errorText";
import type { RunRoundHandlersDeps } from "@/lib/runRoundHandlerTypes";
import type { RunSession } from "@/hooks/useRunSession";

export type RunRoundCancelHandlers = {
  resolveCancelableRunSession: () => RunSession | null;
  applyCancelRequestedUi: (runSession: RunSession) => void;
  handleCancelRunRound: () => Promise<void>;
};

export function createRunRoundCancelHandlers(deps: RunRoundHandlersDeps): RunRoundCancelHandlers {
  function resolveCancelableRunSession() {
    const runSession = deps.getRunSession();
    if (!runSession || !deps.getCurrentRunToken() || runSession.runId !== deps.getCurrentRunToken()) {
      deps.setNotice("当前没有可中断的运行任务。");
      return null;
    }
    return runSession;
  }

  function applyCancelRequestedUi(runSession: RunSession) {
    deps.markRunSessionCancelRequested(runSession);
    deps.transitionTask(runSession.taskTicket, "canceling-run", {
      runtimeStep: "正在中断当前轮次",
    });
    deps.setNotice("已请求中断。已完成的块会保留，稍后点击执行可从断点继续。");
    deps.setRuntimeStep("正在中断当前轮次");
  }

  async function handleCancelRunRound() {
    const runSession = resolveCancelableRunSession();
    if (!runSession) return;
    try {
      applyCancelRequestedUi(runSession);
      await deps.service.cancelRunRound(runSession.runId);
    } catch (appError) {
      deps.setError(stringifyError(appError));
      if (deps.isActiveRunSession(runSession)) {
        deps.transitionTask(runSession.taskTicket, "running-round");
      }
    }
  }

  return {
    resolveCancelableRunSession,
    applyCancelRequestedUi,
    handleCancelRunRound,
  };
}

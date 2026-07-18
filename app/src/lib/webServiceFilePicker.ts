export function pickSingleFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    input.tabIndex = -1;

    let settled = false;
    let opened = false;
    let sawDialogBlur = false;
    let userReturnArmed = false;
    let cancelCheckTimer: number | undefined;
    let watchdogTimer: number | undefined;
    let focusPollTimer: number | undefined;
    let armUserReturnTimer: number | undefined;

    const cleanup = () => {
      if (cancelCheckTimer !== undefined) {
        window.clearTimeout(cancelCheckTimer);
      }
      if (watchdogTimer !== undefined) {
        window.clearTimeout(watchdogTimer);
      }
      if (focusPollTimer !== undefined) {
        window.clearInterval(focusPollTimer);
      }
      if (armUserReturnTimer !== undefined) {
        window.clearTimeout(armUserReturnTimer);
      }
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pointerdown", handleUserReturnedToPage, true);
      document.removeEventListener("keydown", handleUserReturnedToPage, true);
      input.remove();
    };

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };

    const scheduleCancelCheck = () => {
      if (!opened || settled) return;
      if (cancelCheckTimer !== undefined) {
        window.clearTimeout(cancelCheckTimer);
      }
      cancelCheckTimer = window.setTimeout(() => {
        if (!input.files?.length && (sawDialogBlur || document.hasFocus())) {
          finish(null);
        }
      }, 350);
    };

    function handleBlur() {
      sawDialogBlur = true;
    }

    function handleFocus() {
      scheduleCancelCheck();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleCancelCheck();
      }
    }

    function handleUserReturnedToPage() {
      if (!userReturnArmed || settled || input.files?.length || !document.hasFocus()) {
        return;
      }
      window.setTimeout(() => {
        if (!settled && !input.files?.length && document.hasFocus()) {
          finish(null);
        }
      }, 0);
    }

    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pointerdown", handleUserReturnedToPage, true);
    document.addEventListener("keydown", handleUserReturnedToPage, true);
    focusPollTimer = window.setInterval(() => {
      if (sawDialogBlur && document.visibilityState === "visible" && document.hasFocus()) {
        scheduleCancelCheck();
      }
    }, 500);
    watchdogTimer = window.setTimeout(() => finish(null), 5 * 60 * 1000);

    document.body.appendChild(input);
    opened = true;
    armUserReturnTimer = window.setTimeout(() => {
      userReturnArmed = true;
    }, 0);
    input.click();
  });
}

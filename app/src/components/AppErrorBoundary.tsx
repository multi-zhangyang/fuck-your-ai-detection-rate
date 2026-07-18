import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null; copied: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FYADR UI rendering failed", error, info.componentStack);
  }

  private copyDetails = async () => {
    const { error } = this.state;
    if (!error) return;
    const details = [error.name, error.message, error.stack].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1600);
    } catch {
      this.setState({ copied: false });
    }
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-5 text-foreground">
        <section className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-destructive/25 bg-card p-6 shadow-soft sm:p-9" role="alert">
          <div className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-destructive/10 blur-3xl" />
          <div className="relative">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" />
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-destructive">界面恢复</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">工作台遇到了一项未预期错误</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              文档和运行产物仍保存在本地。重新载入通常可以恢复；如果问题持续，可复制诊断详情后再反馈。
            </p>
            <details className="mt-5 rounded-xl border border-border/80 bg-muted/45 p-4 text-left">
              <summary className="cursor-pointer text-sm font-semibold">查看诊断详情</summary>
              <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-muted-foreground">{error.message}</pre>
            </details>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => void this.copyDetails()}>
                <Copy data-icon="inline-start" />
                {copied ? "已复制" : "复制诊断"}
              </Button>
              <Button type="button" onClick={() => window.location.reload()}>
                <RefreshCw data-icon="inline-start" />
                重新载入工作台
              </Button>
            </div>
          </div>
        </section>
      </main>
    );
  }
}

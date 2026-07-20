import { useEffect, useId, useState, type FormEvent } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, LockKeyhole, LogIn, RefreshCw, ShieldCheck } from "lucide-react";

import { ThemeModeMenu } from "@/components/ThemeModeMenu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";

type Props = {
  busy: boolean;
  error: string;
  connectionError: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
  onRetry: () => void;
};

export function LoginPage({ busy, error, connectionError, onLogin, onRetry }: Props) {
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!busy) return;
    setPassword("");
  }, [busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connectionError || busy || !username.trim() || !password) return;
    await onLogin(username.trim(), password);
  }

  return (
    <TooltipProvider delayDuration={250}>
      <main className="auth-shell min-h-svh overflow-y-auto bg-background text-foreground">
        <div className="fixed right-4 top-4 z-10"><ThemeModeMenu /></div>
        <div className="mx-auto grid min-h-svh w-full max-w-[1120px] place-items-center px-4 py-12 sm:px-8">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="hidden min-w-0 lg:block" aria-label="FYADR">
              <div className="flex items-center gap-4">
                <span className="auth-brand-mark flex size-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <img src="/brand-logo-96.webp" alt="" className="size-12 object-contain grayscale contrast-125" />
                </span>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">FYADR</p>
                  <h1 className="mt-1 text-3xl font-semibold">论文 AI 降检平台</h1>
                </div>
              </div>
              <div className="mt-10 grid max-w-xl grid-cols-3 gap-3" aria-hidden="true">
                <div className="auth-signal-line h-1 rounded-full bg-foreground" />
                <div className="auth-signal-line h-1 rounded-full bg-success" />
                <div className="auth-signal-line h-1 rounded-full bg-warning" />
              </div>
            </section>

            <Card className="w-full overflow-hidden border-border bg-card/95 shadow-soft">
              <CardHeader className="border-b border-border/70 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="vercel-icon-frame size-10"><LockKeyhole className="size-5" /></span>
                    <div className="min-w-0">
                      <Badge variant="success" className="mb-2"><ShieldCheck className="mr-1 size-3" />受保护工作区</Badge>
                      <CardTitle className="text-xl">登录 FYADR</CardTitle>
                    </div>
                  </div>
                  <span className="flex size-9 items-center justify-center overflow-hidden rounded-lg border border-border bg-background lg:hidden">
                    <img src="/brand-logo-96.webp" alt="" className="size-8 object-contain grayscale contrast-125" />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-5 sm:p-6">
                {error ? (
                  <Alert variant="destructive" className="mb-5" aria-live="polite">
                    <AlertCircle />
                    <AlertTitle>{connectionError ? "服务暂不可用" : "登录失败"}</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                {connectionError ? (
                  <Button type="button" className="w-full" onClick={onRetry} disabled={busy}>
                    {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <RefreshCw />}
                    重新连接
                  </Button>
                ) : (
                  <form onSubmit={(event) => { void submit(event); }}>
                    <FieldGroup className="gap-5">
                      <Field>
                        <FieldLabel htmlFor={usernameId}>用户名</FieldLabel>
                        <Input
                          id={usernameId}
                          name="username"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          maxLength={80}
                          value={username}
                          disabled={busy}
                          onChange={(event) => setUsername(event.target.value)}
                          autoFocus
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={passwordId}>密码</FieldLabel>
                        <div className="relative">
                          <Input
                            id={passwordId}
                            name="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            maxLength={1024}
                            className="pr-11"
                            value={password}
                            disabled={busy}
                            onChange={(event) => setPassword(event.target.value)}
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1 size-8"
                                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                                aria-pressed={showPassword}
                                onClick={() => setShowPassword((value) => !value)}
                                disabled={busy}
                              >
                                {showPassword ? <EyeOff /> : <Eye />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{showPassword ? "隐藏密码" : "显示密码"}</TooltipContent>
                          </Tooltip>
                        </div>
                        <FieldDescription>会话仅保存在当前浏览器的安全 Cookie 中。</FieldDescription>
                      </Field>
                      <Button type="submit" size="lg" className="w-full" disabled={busy || !username.trim() || !password}>
                        {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <LogIn />}
                        {busy ? "正在验证" : "登录"}
                      </Button>
                    </FieldGroup>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </TooltipProvider>
  );
}

export function AuthLoadingScreen() {
  return (
    <main className="auth-shell grid min-h-svh place-items-center bg-background px-4 text-foreground" aria-busy="true">
      <div className="flex flex-col items-center gap-4 text-center" aria-live="polite">
        <span className="flex size-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <img src="/brand-logo-96.webp" alt="" className="size-12 object-contain grayscale contrast-125" />
        </span>
        <div>
          <div className="text-base font-semibold">FYADR</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className={LOADING_ICON_CLASS_NAME} />
            正在检查会话
          </div>
        </div>
      </div>
    </main>
  );
}

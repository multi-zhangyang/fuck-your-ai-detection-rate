import { Alert, AlertTitle } from "@/components/ui/alert";

const T = {
  liveRunning: "运行中",
  checkpointIncomplete: "断点未完成",
};

export function LiveHint({ running }: { running: boolean }) {
  return (
    <Alert className="shrink-0">
      <AlertTitle>{running ? T.liveRunning : T.checkpointIncomplete}</AlertTitle>
    </Alert>
  );
}

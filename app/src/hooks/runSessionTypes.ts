export type RunSession = {
  sessionId: number;
  runId: string;
  sourcePath: string;
  round: number;
  taskTicket: number;
  mode: "start" | "attach";
  cancelRequested: boolean;
};

export type BatchRerunSession = {
  runId: string;
  taskTicket: number;
  label: string;
  cancelRequested: boolean;
};

export type ProgressUnlisten = () => void | Promise<void>;

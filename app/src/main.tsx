import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "@/App";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { webService } from "@/lib/webService";
import "@/styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App service={webService} />
    </AppErrorBoundary>
  </React.StrictMode>,
);

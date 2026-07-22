import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "./theme";
import "./index.css";

function Root() {
  const theme = useTheme();
  return (
    <StrictMode>
      <App />
      <Toaster theme={theme} visibleToasts={1} />
    </StrictMode>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);

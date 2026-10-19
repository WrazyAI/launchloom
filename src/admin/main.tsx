import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp, AdminLoginPlaceholder } from "./AdminApp";
import "./styles.css";

const root = document.getElementById("admin-root");

if (root) {
  const mode = document.body.dataset.adminView;
  createRoot(root).render(
    <StrictMode>
      {mode === "login" ? <AdminLoginPlaceholder /> : <AdminApp />}
    </StrictMode>,
  );
}

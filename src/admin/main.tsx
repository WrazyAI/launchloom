import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAdminApi } from "./api";
import { AdminApp } from "./AdminApp";
import { SignInView } from "./SignInView";
import "./styles.css";
import "./redesign.css";

const root = document.getElementById("admin-root");

if (root) {
  const mode = document.body.dataset.adminView;
  createRoot(root).render(
    <StrictMode>
      {mode === "login" ? <SignInView api={createAdminApi()} /> : <AdminApp />}
    </StrictMode>,
  );
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initTelegram } from "./lib/telegram";
import ApplicantApp from "./applicant/ApplicantApp";
import AdminApp from "./admin/AdminApp";

initTelegram();
const isAdmin = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <ApplicantApp />}</StrictMode>,
);

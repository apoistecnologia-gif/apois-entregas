import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CatalogOptionsPortal from "./CatalogOptionsPortal";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <CatalogOptionsPortal />
  </React.StrictMode>,
);

import React, { createElement } from "react";
import { createBrowserRouter, redirect } from "react-router";
import RootLayout from "./layouts/RootLayout";
import ProtectedOutlet from "./components/ProtectedOutlet";
import { PermissionGuard } from "./components/PermissionGuard";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import IncidentSelector from "./pages/IncidentSelector";
import Dashboard from "./pages/Dashboard";
import GlobalDashboard from "./pages/GlobalDashboard";
import SecuriteCompte from "./pages/SecuriteCompte";
import Cartographie from "./pages/Cartographie";
import Annuaire from "./pages/Annuaire";
import Bibliotheque from "./pages/Bibliotheque";
import MainCouranteDirection from "./pages/MainCouranteDirection";
import MainCouranteOperationnelle from "./pages/MainCouranteOperationnelle";
import Timeline from "./pages/Timeline";
import Administration from "./pages/Administration";
import IncidentProposals from "./pages/IncidentProposals";
import WazuhConnectors from "./pages/WazuhConnectors";
import NotFound from "./pages/NotFound";

function guarded(resource: string, Page: React.ComponentType) {
  return () => createElement(PermissionGuard, { resource }, createElement(Page));
}

export const router = createBrowserRouter([
  {
    path: "/",
    loader: () => redirect("/dashboard"),
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/change-password",
    Component: ChangePassword,
  },
  // ─── Routes protégées ──────────────────────────────────────────────────────
  {
    Component: ProtectedOutlet,
    children: [
      {
        path: "/dashboard",
        Component: RootLayout,
        children: [
          {
            index: true,
            Component: guarded("DASHBOARD", GlobalDashboard),
          },
        ],
      },
      {
        path: "/securite-compte",
        Component: RootLayout,
        children: [
          {
            index: true,
            Component: guarded("DASHBOARD", SecuriteCompte),
          },
        ],
      },
      {
        path: "/cartographie",
        Component: RootLayout,
        children: [
          {
            index: true,
            Component: guarded("DASHBOARD", Cartographie),
          },
        ],
      },
      {
        path: "/propositions-incidents",
        Component: RootLayout,
        children: [
          {
            index: true,
            Component: guarded("DASHBOARD", IncidentProposals),
          },
        ],
      },
      {
        path: "/connecteurs-wazuh",
        Component: RootLayout,
        children: [
          {
            index: true,
            Component: guarded("ADMIN", WazuhConnectors),
          },
        ],
      },
      {
        path: "/incidents",
        Component: IncidentSelector,
      },
      {
        path: "/incidents/:incidentId",
        Component: RootLayout,
        children: [
          {
            index: true,
            loader: ({ params }) =>
              redirect(`/incidents/${params.incidentId ?? ""}/dashboard`),
          },
          { path: "dashboard", Component: guarded("DASHBOARD", Dashboard) },
          { path: "annuaire", Component: guarded("ANNUAIRE", Annuaire) },
          { path: "bibliotheque", Component: guarded("BIBLIOTHEQUE", Bibliotheque) },
          { path: "main-courante-direction", Component: guarded("MAIN_COURANTE_DIR", MainCouranteDirection) },
          { path: "main-courante-operationnelle", Component: guarded("MAIN_COURANTE_OPS", MainCouranteOperationnelle) },
          { path: "timeline", Component: guarded("TIMELINE", Timeline) },
          { path: "admin", Component: guarded("ADMIN", Administration) },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
  {
    path: "*",
    Component: NotFound,
  },
]);

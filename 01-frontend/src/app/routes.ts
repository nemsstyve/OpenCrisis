import React, { createElement } from "react";
import { createBrowserRouter, redirect } from "react-router";
import RootLayout from "./layouts/RootLayout";
import ProtectedOutlet from "./components/ProtectedOutlet";
import { PermissionGuard } from "./components/PermissionGuard";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import IncidentSelector from "./pages/IncidentSelector";
import Dashboard from "./pages/Dashboard";
import Annuaire from "./pages/Annuaire";
import Bibliotheque from "./pages/Bibliotheque";
import MainCouranteDirection from "./pages/MainCouranteDirection";
import MainCouranteOperationnelle from "./pages/MainCouranteOperationnelle";
import Timeline from "./pages/Timeline";
import Administration from "./pages/Administration";
import NotFound from "./pages/NotFound";

function guarded(resource: string, Page: React.ComponentType) {
  return () => createElement(PermissionGuard, { resource }, createElement(Page));
}

export const router = createBrowserRouter([
  {
    path: "/",
    loader: () => redirect("/incidents"),
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

import { createBrowserRouter, redirect } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Login from "./pages/Login";
import IncidentSelector from "./pages/IncidentSelector";
import Dashboard from "./pages/Dashboard";
import Annuaire from "./pages/Annuaire";
import Bibliotheque from "./pages/Bibliotheque";
import MainCouranteDirection from "./pages/MainCouranteDirection";
import MainCouranteOperationnelle from "./pages/MainCouranteOperationnelle";
import Timeline from "./pages/Timeline";
import NotFound from "./pages/NotFound";

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
      { path: "dashboard", Component: Dashboard },
      { path: "annuaire", Component: Annuaire },
      { path: "bibliotheque", Component: Bibliotheque },
      { path: "main-courante-direction", Component: MainCouranteDirection },
      { path: "main-courante-operationnelle", Component: MainCouranteOperationnelle },
      { path: "timeline", Component: Timeline },
      { path: "*", Component: NotFound },
    ],
  },
  {
    path: "*",
    Component: NotFound,
  },
]);

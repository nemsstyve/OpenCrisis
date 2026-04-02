import { createBrowserRouter } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Dashboard from "./pages/Dashboard";
import Annuaire from "./pages/Annuaire";
import Cartographie from "./pages/Cartographie";
import Bibliotheque from "./pages/Bibliotheque";
import MainCouranteDirection from "./pages/MainCouranteDirection";
import MainCouranteOperationnelle from "./pages/MainCouranteOperationnelle";
import Timeline from "./pages/Timeline";
import Artifacts from "./pages/Artifacts";
import TableauBlanc from "./pages/TableauBlanc";
import NotFound from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "annuaire", Component: Annuaire },
      { path: "cartographie", Component: Cartographie },
      { path: "bibliotheque", Component: Bibliotheque },
      { path: "main-courante-direction", Component: MainCouranteDirection },
      { path: "tableau-blanc", Component: TableauBlanc },
      { path: "main-courante-operationnelle", Component: MainCouranteOperationnelle },
      { path: "timeline", Component: Timeline },
      { path: "artifacts", Component: Artifacts },
      { path: "*", Component: NotFound },
    ],
  },
]);
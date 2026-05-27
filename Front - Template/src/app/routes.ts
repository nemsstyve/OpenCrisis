import { createBrowserRouter } from "react-router";
import RootLayout from "./layouts/RootLayout";
import Annuaire from "./pages/Annuaire";
import Bibliotheque from "./pages/Bibliotheque";
import MainCouranteDirection from "./pages/MainCouranteDirection";
import MainCouranteOperationnelle from "./pages/MainCouranteOperationnelle";
import Timeline from "./pages/Timeline";
import NotFound from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: Annuaire },
      { path: "annuaire", Component: Annuaire },
      { path: "bibliotheque", Component: Bibliotheque },
      { path: "main-courante-direction", Component: MainCouranteDirection },
      { path: "main-courante-operationnelle", Component: MainCouranteOperationnelle },
      { path: "timeline", Component: Timeline },
      { path: "*", Component: NotFound },
    ],
  },
]);
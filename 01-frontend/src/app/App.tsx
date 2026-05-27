import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ThemeProvider } from "./providers/ThemeProvider";
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "../lib/apolloClient";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <ApolloProvider client={apolloClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </ApolloProvider>
    </ErrorBoundary>
  );
}

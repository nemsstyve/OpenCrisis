import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ThemeProvider } from "./providers/ThemeProvider";
import { ApolloProvider } from "@apollo/client";
import { apolloClient } from "../lib/apolloClient";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "../context/AuthContext";
import { Toaster } from "sonner";

export default function App() {
  return (
    <ErrorBoundary>
      <ApolloProvider client={apolloClient}>
        <ThemeProvider>
          <AuthProvider>
            <RouterProvider router={router} />
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </ApolloProvider>
    </ErrorBoundary>
  );
}

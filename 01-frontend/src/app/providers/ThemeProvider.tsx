import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" forcedTheme="dark">{/* DÉC-UI-1 : thème sombre forcé */}
      {children}
    </NextThemesProvider>
  );
}

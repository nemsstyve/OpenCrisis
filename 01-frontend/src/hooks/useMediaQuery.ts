import { useEffect, useState } from "react";

/**
 * Retourne `true` tant que la media query CSS passée correspond.
 * Ex. : useMediaQuery("(max-width: 1023px)") pour cibler tablette + en dessous.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

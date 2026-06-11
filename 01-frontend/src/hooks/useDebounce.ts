import { useEffect, useState } from "react";

/**
 * Renvoie une version retardée de `value` (VII4).
 * Évite de recalculer filtres/recherches à chaque frappe.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

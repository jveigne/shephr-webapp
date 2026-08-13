  import { useEffect, useState } from "react";

/**
 * Valeur retardée : la recherche des membres part maintenant au serveur, on ne déclenche donc pas
 * une requête à chaque frappe. 300 ms — assez court pour rester instantané à l'usage.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

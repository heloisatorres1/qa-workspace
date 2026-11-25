import { useSearchParams } from 'react-router-dom';

/**
 * Sets or clears one query parameter, keeping the others.
 *
 * It starts from the address bar as it is now. The router's own copy (and the value its
 * updater callback receives) is the one from the last render, so two changes made before
 * a re-render would otherwise undo each other.
 */
export function useSetUrlParam() {
  const [, setParams] = useSearchParams();
  return (key: string, value: string | null) => {
    // HashRouter keeps the query inside the hash: #/triage?severity=critical
    const next = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
}

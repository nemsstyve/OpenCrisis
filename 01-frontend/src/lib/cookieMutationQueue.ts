/**
 * Ordonnancement des requetes HTTP qui modifient
 * le cookie HttpOnly de renouvellement.
 *
 * L'ordre est celui de l'entree dans la file.
 * Chaque requete attend la fin de la precedente,
 * y compris lorsque celle-ci echoue.
 *
 * Cette file est locale a un onglet. Les autres
 * onglets restent a traiter separement.
 */

let tail: Promise<void> = Promise.resolve();

const AUTH_COOKIE_LOCK = "opencrisis-auth-cookie-v1";

async function runWithBrowserLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  // Web Locks fonctionne entre onglets de meme origine
  // dans les navigateurs qui prennent en charge cette API.
  if (
    typeof navigator !== "undefined" &&
    navigator.locks?.request
  ) {
    return navigator.locks.request(
      AUTH_COOKIE_LOCK,
      { mode: "exclusive" },
      operation,
    );
  }

  // Repli pour les environnements sans Web Locks :
  // protection locale uniquement.
  return operation();
}

export function serializeCookieOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  // Respecter l'ordre des operations dans cet onglet.
  // Le verrou inter-onglets est acquis seulement
  // lorsque cette operation atteint la tete de file.
  const result = tail.then(
    () => runWithBrowserLock(operation),
  );

  // Ne jamais bloquer la file apres une erreur.
  tail = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

const COOKIE_MUTATIONS = new Set([
  "Login",
  "Logout",
  "RefreshToken",
]);

function isCookieMutation(body: BodyInit | null | undefined): boolean {
  if (typeof body !== "string") return false;

  try {
    const payload: unknown = JSON.parse(body);

    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return false;
    }

    const request = payload as {
      operationName?: unknown;
      query?: unknown;
    };

    if (
      typeof request.operationName === "string" &&
      COOKIE_MUTATIONS.has(request.operationName)
    ) {
      return true;
    }

    if (typeof request.query !== "string") return false;

    return /\bmutation\s+(Login|Logout|RefreshToken)\b/.test(
      request.query
    );
  } catch {
    return false;
  }
}

/**
 * Fetch utilise par Apollo HttpLink.
 * Les autres operations GraphQL ne sont pas ralenties.
 */
export const serializedAuthFetch: typeof fetch = (
  input,
  init,
) => {
  if (!isCookieMutation(init?.body)) {
    return fetch(input, init);
  }

  return serializeCookieOperation(() => fetch(input, init));
};

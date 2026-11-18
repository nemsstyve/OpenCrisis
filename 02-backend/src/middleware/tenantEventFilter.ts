/**
 * Filtre les événements d'un abonnement par entreprise.
 *
 * Le tenant est revérifié avant chaque événement.
 * En cas de révocation ou d'erreur, le flux est fermé.
 */
export async function* tenantEventFilter<T>(
  source: AsyncIterable<T>,
  expectedTenantId: string,
  resolveActiveTenantId: () => Promise<string>,
  extractTenantId: (event: T) => string | null | undefined,
): AsyncGenerator<T> {
  if (!expectedTenantId) return;

  for await (const event of source) {
    let activeTenantId: string;

    try {
      activeTenantId = await resolveActiveTenantId();
    } catch {
      return;
    }

    if (
      !activeTenantId ||
      activeTenantId !== expectedTenantId
    ) {
      return;
    }

    if (extractTenantId(event) === activeTenantId) {
      yield event;
    }
  }
}

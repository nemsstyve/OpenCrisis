import { GraphQLError } from 'graphql';

/** V0.3 : seuls des indicateurs à faible risque de divulgation sont publiables. */
export function normalizeShareableIoC(type: string, value: string): string {
  const v = value.trim();
  if (type === 'HASH_SHA256' && /^[a-fA-F0-9]{64}$/.test(v)) return v.toLowerCase();
  if (type === 'DOMAIN') {
    const d = v.toLowerCase().replace(/\.$/, '');
    if (d.length <= 253 && d.includes('.') &&
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d) &&
        !/(?:^|\.)(?:local|localhost|internal|test|invalid|example)$/.test(d)) return d;
  }
  throw new GraphQLError('IOC non publiable : seuls SHA256 et domaines publics valides sont acceptes', {
    extensions: { code: 'BAD_USER_INPUT' },
  });
}

export function validatedPublicText(text: string, field: string, max: number): string {
  if (typeof text !== 'string' || !text.trim() || text.length > max) {
    throw new GraphQLError(`${field} invalide`, { extensions: { code: 'BAD_USER_INPUT' } });
  }
  // Empêche de coller un document ou des journaux dans une fiche partagée.
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
    throw new GraphQLError(`${field} contient des caracteres interdits`, { extensions: { code: 'BAD_USER_INPUT' } });
  }
  return text.trim();
}

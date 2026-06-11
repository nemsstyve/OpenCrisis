// graphql-depth-limit ne fournit pas de types ; déclaration minimale.
declare module 'graphql-depth-limit' {
  import type { ValidationRule } from 'graphql';
  export default function depthLimit(
    maxDepth: number,
    options?: { ignore?: Array<string | RegExp> },
    callback?: (depths: Record<string, number>) => void,
  ): ValidationRule;
}

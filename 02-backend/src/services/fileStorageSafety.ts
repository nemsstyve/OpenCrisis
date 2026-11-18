import { constants } from 'fs';
import fs from 'fs/promises';
import path from 'path';

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative);
}

function resolveStoredPath(
  root: string,
  relativePath: string,
): string {
  if (
    typeof relativePath !== 'string' ||
    !relativePath ||
    relativePath.includes('\0') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Chemin documentaire invalide');
  }

  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relativePath);

  if (!isInside(absoluteRoot, candidate)) {
    throw new Error('Chemin hors stockage');
  }

  return candidate;
}

/**
 * Lecture Linux depuis un descripteur deja verifie.
 *
 * O_NOFOLLOW refuse un lien symbolique final.
 * /proc/self/fd permet de verifier la cible ouverte,
 * y compris en presence de liens dans les parents.
 */
export async function openVerifiedUpload(
  root: string,
  relativePath: string,
): Promise<fs.FileHandle> {
  const candidate = resolveStoredPath(root, relativePath);
  const realRoot = await fs.realpath(root);

  const handle = await fs.open(
    candidate,
    constants.O_RDONLY |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
  );

  try {
    const stat = await handle.stat();

    if (!stat.isFile()) {
      throw new Error('Document non regulier');
    }

    const actual = await fs.realpath(
      `/proc/self/fd/${handle.fd}`,
    );

    if (!isInside(realRoot, actual)) {
      throw new Error('Document hors stockage autorise');
    }

    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/**
 * Suppression restrictive.
 *
 * Ne garantit pas a elle seule la securite face
 * a un remplacement concurrent de repertoire.
 */
export async function removeVerifiedUpload(
  root: string,
  relativePath: string,
): Promise<void> {
  const candidate = resolveStoredPath(root, relativePath);
  const realRoot = await fs.realpath(root);
  const realParent = await fs.realpath(
    path.dirname(candidate),
  );

  if (
    realParent !== realRoot &&
    !isInside(realRoot, realParent)
  ) {
    throw new Error('Repertoire hors stockage');
  }

  const stat = await fs.lstat(candidate);

  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Suppression refusee');
  }

  await fs.unlink(candidate);
}

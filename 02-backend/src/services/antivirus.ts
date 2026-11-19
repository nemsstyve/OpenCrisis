import net from 'node:net';
import fs from 'node:fs';

export class AntivirusError extends Error {
  constructor(
    message: string,
    public readonly status: 422 | 503,
  ) {
    super(message);
    this.name = 'AntivirusError';
  }
}

const MAX_RESPONSE = 4096;
const DEADLINE_MS = 30_000;

export async function scanUploadFile(
  filePath: string,
): Promise<void> {
  const host = process.env.CLAMAV_HOST || 'clamav';
  const port = Number(process.env.CLAMAV_PORT || '3310');

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new AntivirusError(
      'Configuration antivirus invalide',
      503,
    );
  }

  const socket = net.createConnection({
    host,
    port,
  });

  let settled = false;
  let response = Buffer.alloc(0);
  let sentTerminator = false;

  let resolveVerdict!: () => void;
  let rejectVerdict!: (error: AntivirusError) => void;

  const verdict = new Promise<void>((resolve, reject) => {
    resolveVerdict = resolve;
    rejectVerdict = reject;
  });

  // Le rejet doit être observé dès sa création :
  // le scanner peut répondre pendant l'envoi.
  void verdict.catch(() => undefined);

  const fail = (
    message = 'Analyse antivirus indisponible',
  ) => {
    if (settled) return;
    settled = true;
    rejectVerdict(new AntivirusError(message, 503));
    socket.destroy();
  };

  const timer = setTimeout(() => {
    fail('Analyse antivirus expirée');
  }, DEADLINE_MS);

  socket.on('error', () => fail());

  socket.on('close', () => {
    if (!settled) fail();
  });

  socket.on('data', (chunk: Buffer) => {
    if (settled) return;

    response = Buffer.concat([response, chunk]);

    if (response.length > MAX_RESPONSE) {
      fail('Réponse antivirus invalide');
      return;
    }

    const end = response.indexOf(0);

    if (end === -1) return;

    if (end !== response.length - 1) {
      fail('Réponse antivirus invalide');
      return;
    }

    const result = response
      .subarray(0, end)
      .toString('utf8');

    if (/^stream: .+ FOUND$/.test(result)) {
      settled = true;
      rejectVerdict(new AntivirusError(
        'Fichier refusé : menace détectée',
        422,
      ));
      socket.destroy();
      return;
    }

    if (result === 'stream: OK' && sentTerminator) {
      settled = true;
      resolveVerdict();
      socket.end();
      return;
    }

    fail('Résultat antivirus non concluant');
  });

  async function write(data: Buffer): Promise<void> {
    if (settled || socket.destroyed) {
      throw new AntivirusError(
        'Connexion antivirus interrompue',
        503,
      );
    }

    await new Promise<void>((resolve, reject) => {
      socket.write(data, (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      if (socket.connecting) {
        socket.once('connect', resolve);
        socket.once('error', reject);
      } else if (socket.destroyed) {
        reject(new Error('Connexion indisponible'));
      } else {
        resolve();
      }
    });

    await write(Buffer.from('zINSTREAM\0'));

    const stream = fs.createReadStream(filePath, {
      highWaterMark: 64 * 1024,
    });

    try {
      for await (const chunk of stream) {
        const buffer = Buffer.from(chunk);
        const header = Buffer.alloc(4);

        header.writeUInt32BE(buffer.length, 0);

        await write(header);
        await write(buffer);
      }
    } finally {
      stream.destroy();
    }

    sentTerminator = true;
    await write(Buffer.alloc(4));

    await verdict;
  } catch (error) {
    if (error instanceof AntivirusError) {
      throw error;
    }

    throw new AntivirusError(
      'Analyse antivirus indisponible',
      503,
    );
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}

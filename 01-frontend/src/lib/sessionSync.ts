/**
 * Synchronisation de session entre onglets
 * de la meme origine navigateur.
 *
 * Aucune identite, aucun JWT et aucune donnee
 * metier ne sont transmis sur ce canal.
 *
 * Un seul objet BroadcastChannel est utilise
 * par contexte JavaScript : les notifications
 * publiees localement ne sont pas recues
 * par leur propre emetteur.
 */

const CHANNEL_NAME = "opencrisis-session-v1";
const EVENT_TYPE = "IDENTITY_CHANGED";

interface SessionMessage {
  type: typeof EVENT_TYPE;
}

let sharedChannel: BroadcastChannel | null = null;
let subscribers = 0;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (!sharedChannel) {
    sharedChannel = new BroadcastChannel(CHANNEL_NAME);
  }

  return sharedChannel;
}

export function publishIdentityChange(): void {
  const channel = getChannel();
  if (!channel) return;

  const message: SessionMessage = {
    type: EVENT_TYPE,
  };

  // Meme objet que celui utilise pour l'ecoute.
  // BroadcastChannel ne renvoie pas le message
  // a l'objet qui l'a publie.
  channel.postMessage(message);
}

export function subscribeToIdentityChanges(
  onChange: () => void,
): () => void {
  const channel = getChannel();

  if (!channel) {
    return () => {};
  }

  const handler = (event: MessageEvent<unknown>) => {
    const data = event.data;

    if (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      data.type === EVENT_TYPE
    ) {
      onChange();
    }
  };

  channel.addEventListener("message", handler);
  subscribers += 1;

  let unsubscribed = false;

  return () => {
    if (unsubscribed) return;
    unsubscribed = true;

    channel.removeEventListener("message", handler);
    subscribers -= 1;

    if (subscribers === 0 && sharedChannel === channel) {
      channel.close();
      sharedChannel = null;
    }
  };
}

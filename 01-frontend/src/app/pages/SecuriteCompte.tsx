import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useMutation } from "@apollo/client";
import { useAuth } from "../../context/AuthContext";
import {
  BEGIN_TOTP_ENROLLMENT_MUTATION,
  ENABLE_TOTP_MUTATION,
  DISABLE_TOTP_MUTATION,
} from "../../graphql/auth";

type Enrollment = {
  secret: string;
  provisioningUri: string;
};

export default function SecuriteCompte() {
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [beginEnrollment] = useMutation(BEGIN_TOTP_ENROLLMENT_MUTATION);
  const [enableTotp] = useMutation(ENABLE_TOTP_MUTATION);
  const [disableTotp] = useMutation(DISABLE_TOTP_MUTATION);

  async function execute(task: () => Promise<void>) {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      await task();
    } catch {
      setError("Opération refusée. Vérifiez vos informations et réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    await execute(async () => {
      const result = await beginEnrollment({
        variables: { password },
        fetchPolicy: "no-cache",
      });

      const value = result.data?.beginTotpEnrollment as
        | Enrollment
        | undefined;

      if (!value?.secret || !value?.provisioningUri) {
        throw new Error("Réponse TOTP absente");
      }

      setEnrollment(value);
      setRecoveryCodes([]);
      setCode("");
      setPassword("");
      setMessage("Ajoutez le compte dans votre application d'authentification.");
    });
  }

  async function activate() {
    await execute(async () => {
      const result = await enableTotp({
        variables: { code },
        fetchPolicy: "no-cache",
      });

      const codes = result.data?.enableTotp as string[] | undefined;

      if (!codes || codes.length !== 10) {
        throw new Error("Codes de récupération absents");
      }

      setRecoveryCodes(codes);
      setEnrollment(null);
      setCode("");
      setMessage(
        "Double authentification activée. Enregistrez maintenant les codes de récupération. " +
        "Vos sessions précédentes ont été révoquées."
      );
    });
  }

  async function deactivate() {
    await execute(async () => {
      const result = await disableTotp({
        variables: { password, code },
        fetchPolicy: "no-cache",
      });

      if (result.data?.disableTotp !== true) {
        throw new Error("Désactivation refusée");
      }

      setCode("");
      setPassword("");
      setMessage("Double authentification désactivée. Reconnectez-vous.");
      await logout();
    });
  }

  return (
    <main className="min-h-full bg-[#0f1116] p-6 text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Sécurité du compte</h1>
          <p className="mt-2 text-sm text-gray-400">
            Configurez la double authentification avec une application TOTP.
          </p>
        </header>

        {error && (
          <p role="alert" className="rounded border border-red-500 p-3 text-red-300">
            {error}
          </p>
        )}

        {message && (
          <p role="status" className="rounded border border-gray-600 p-3">
            {message}
          </p>
        )}

        {recoveryCodes.length > 0 ? (
          <section className="space-y-4 rounded-xl border border-gray-700 p-5">
            <h2 className="text-xl font-semibold">Codes de récupération</h2>
            <p className="text-sm text-amber-300">
              Ces codes sont affichés une seule fois. Conservez-les dans un
              gestionnaire de mots de passe. Chaque code est à usage unique.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {recoveryCodes.map((value) => (
                <code key={value} className="break-all rounded bg-gray-900 p-2 text-sm">
                  {value}
                </code>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const blob = recoveryCodes.join("\n");
                void navigator.clipboard.writeText(blob).catch(() => {
                  setError("Copie indisponible. Enregistrez les codes manuellement.");
                });
              }}
              className="rounded bg-blue-600 px-4 py-2"
            >
              Copier les codes
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="ml-2 rounded border border-gray-500 px-4 py-2"
            >
              Terminer et se déconnecter
            </button>
          </section>
        ) : (
          <section className="space-y-5 rounded-xl border border-gray-700 p-5">
            {enrollment && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">
                  Configuration de l'application
                </h2>
                <p className="text-sm text-gray-400">
                  Ajoutez manuellement la clé suivante dans votre application
                  d'authentification. Le code change toutes les 30 secondes.
                </p>
                <div className="flex justify-center">
                  <div className="rounded-xl bg-white p-4">
                    <QRCodeSVG
                      value={enrollment.provisioningUri}
                      size={224}
                      level="M"
                      marginSize={4}
                      title="QR code de configuration TOTP OpenCrisis"
                    />
                  </div>
                </div>
                <p className="text-sm text-gray-400">
                  Scannez ce QR code avec votre application
                  d'authentification. Si le scan est impossible,
                  utilisez la cle de configuration ci-dessous.
                </p>
                <code className="block break-all rounded bg-gray-900 p-3 text-sm">
                  {enrollment.secret}
                </code>
              </div>
            )}

            <label className="block space-y-2">
              <span className="text-sm">Mot de passe actuel</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border border-gray-600 bg-gray-900 p-2"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm">
                Code TOTP à 6 chiffres
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
                className="w-full rounded border border-gray-600 bg-gray-900 p-2"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              {!enrollment ? (
                <button
                  type="button"
                  disabled={busy || !password}
                  onClick={() => void start()}
                  className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50"
                >
                  Préparer l'activation
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !/^[0-9]{6}$/.test(code)}
                  onClick={() => void activate()}
                  className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50"
                >
                  Activer le TOTP
                </button>
              )}

              {!enrollment && (
                <button
                  type="button"
                  disabled={busy || !password || !/^[0-9]{6}$/.test(code)}
                  onClick={() => void deactivate()}
                  className="rounded border border-red-500 px-4 py-2 disabled:opacity-50"
                >
                  Désactiver le TOTP
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500">
              La désactivation exige le mot de passe et un code TOTP valide.
              Une procédure de récupération administrateur devra être définie.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

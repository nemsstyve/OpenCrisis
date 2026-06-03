import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "@apollo/client";
import { CHANGE_PASSWORD_MUTATION } from "../../graphql/auth";
import { useAppStore } from "../../store/useAppStore";

const PASSWORD_RULES = [
  { label: "8 caractères minimum", test: (p: string) => p.length >= 8 },
  { label: "1 majuscule", test: (p: string) => /[A-Z]/.test(p) },
  { label: "1 chiffre", test: (p: string) => /[0-9]/.test(p) },
  { label: "1 caractère spécial", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function ChangePassword() {
  const navigate = useNavigate();
  const currentUser = useAppStore((s) => s.currentUser);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [changePassword, { loading }] = useMutation(CHANGE_PASSWORD_MUTATION);

  const rulesValid = PASSWORD_RULES.every((r) => r.test(newPassword));
  const passwordsMatch = newPassword === confirm;
  const canSubmit = rulesValid && passwordsMatch && currentPassword.length > 0 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passwordsMatch) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    try {
      await changePassword({ variables: { currentPassword, newPassword } });
      // Mettre à jour le store pour lever le flag mustChangePassword
      const current = useAppStore.getState().currentUser;
      if (current) {
        useAppStore.getState().setCurrentUser({ ...current, mustChangePassword: false });
      }
      navigate("/incidents", { replace: true });
    } catch (err: unknown) {
      const graphqlMsg = (err as { graphQLErrors?: Array<{ message: string }> })
        ?.graphQLErrors?.[0]?.message;
      setError(graphqlMsg ?? "Erreur lors du changement de mot de passe");
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1116] flex items-center justify-center">
      <div className="w-full max-w-sm bg-[#13151a] border border-[#1e2229] rounded-lg p-8">
        <div className="mb-6">
          <h1 className="text-xl text-white font-medium">Changement de mot de passe requis</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {currentUser?.firstName
              ? `Bonjour ${currentUser.firstName}, votre`
              : "Votre"}{" "}
            compte nécessite un nouveau mot de passe avant de continuer.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Mot de passe actuel</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Nouveau mot de passe</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {/* Indicateur de règles */}
            {newPassword.length > 0 && (
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule.label} className="flex items-center gap-2 text-xs">
                    <span className={rule.test(newPassword) ? "text-green-400" : "text-gray-500"}>
                      {rule.test(newPassword) ? "✓" : "○"}
                    </span>
                    <span className={rule.test(newPassword) ? "text-green-400" : "text-gray-500"}>
                      {rule.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Confirmer le mot de passe</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              className={`w-full bg-[#0a0b0d] border rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none transition-colors ${
                confirm.length > 0 && !passwordsMatch
                  ? "border-red-500 focus:border-red-500"
                  : "border-[#1e2229] focus:border-blue-500"
              }`}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-md px-3 py-2 text-sm font-medium transition-colors mt-2 flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}

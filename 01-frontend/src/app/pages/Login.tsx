import { useState } from "react";
import { useNavigate } from "react-router";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Phase 5 : remplacer par mutation GraphQL login
    navigate("/incidents");
  }

  return (
    <div className="min-h-screen bg-[#0f1116] flex items-center justify-center">
      <div className="w-full max-w-sm bg-[#13151a] border border-[#1e2229] rounded-lg p-8">
        <div className="mb-8">
          <h1 className="text-2xl text-white font-medium">Open Crisis</h1>
          <p className="text-gray-400 mt-1 text-sm">Connectez-vous à votre espace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Adresse e-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@opencrisis.local"
              required
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[#0a0b0d] border border-[#1e2229] rounded-md px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md px-3 py-2 text-sm font-medium transition-colors mt-2"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}

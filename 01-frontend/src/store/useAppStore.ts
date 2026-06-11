import { create } from "zustand";
import type { GqlUser, GqlIncident } from "../types/generated";

interface AppStore {
  currentUser: GqlUser | null;
  currentIncident: GqlIncident | null;
  setCurrentUser: (user: GqlUser | null) => void;
  setCurrentIncident: (incident: GqlIncident | null) => void;
  /** Vérifie si l'utilisateur possède la permission resource:action */
  hasPermission: (resource: string, action?: "READ" | "WRITE") => boolean;
  clearSession: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentUser: null,
  currentIncident: null,

  setCurrentUser: (user) => set({ currentUser: user }),
  setCurrentIncident: (incident) => set({ currentIncident: incident }),

  hasPermission: (resource, action = "READ") => {
    const { currentUser } = get();
    if (!currentUser) return false;
    return (currentUser.permissions ?? []).some(
      (p) => p.resource === resource && p.action === action
    );
  },

  clearSession: () => set({ currentUser: null, currentIncident: null }),
}));

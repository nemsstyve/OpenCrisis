import { create } from "zustand";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  permissions: string[];
}

interface Incident {
  id: string;
  name: string;
  status: "ACTIVE" | "CONTAINED" | "CLOSED";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

interface AppStore {
  currentUser: User | null;
  currentIncident: Incident | null;
  setCurrentUser: (user: User | null) => void;
  setCurrentIncident: (incident: Incident | null) => void;
  hasPermission: (resource: string) => boolean;
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentUser: null,
  currentIncident: null,

  setCurrentUser: (user) => set({ currentUser: user }),
  setCurrentIncident: (incident) => set({ currentIncident: incident }),

  hasPermission: (resource: string) => {
    const { currentUser } = get();
    if (!currentUser) return false;
    return currentUser.permissions.includes(resource);
  },
}));

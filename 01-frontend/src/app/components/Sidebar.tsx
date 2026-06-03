import { Link, useLocation, useParams, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  Library,
  FileText,
  Clock,
  ChevronLeft,
  LogOut,
  Settings,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function buildNavSections(incidentId: string): NavSection[] {
  const base = `/incidents/${incidentId}`;
  return [
    {
      title: "Vue d'ensemble",
      items: [
        { path: `${base}/dashboard`, label: "Tableau de bord", icon: LayoutDashboard, permission: "DASHBOARD" },
        { path: `${base}/annuaire`, label: "Annuaire", icon: Users, permission: "ANNUAIRE" },
        { path: `${base}/bibliotheque`, label: "Bibliothèque", icon: Library, permission: "BIBLIOTHEQUE" },
      ],
    },
    {
      title: "Cellule de Direction",
      items: [
        { path: `${base}/main-courante-direction`, label: "Main courante", icon: FileText, permission: "MAIN_COURANTE_DIR" },
      ],
    },
    {
      title: "Cellule opérationnelle",
      items: [
        { path: `${base}/main-courante-operationnelle`, label: "Main courante", icon: FileText, permission: "MAIN_COURANTE_OPS" },
        { path: `${base}/timeline`, label: "Timeline", icon: Clock, permission: "TIMELINE" },
      ],
    },
    {
      title: "Système",
      items: [
        { path: `${base}/admin`, label: "Administration", icon: Settings, permission: "ADMIN" },
      ],
    },
  ];
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { incidentId } = useParams<{ incidentId: string }>();
  const { logout } = useAuth();
  const currentUser = useAppStore((s) => s.currentUser);
  const currentIncident = useAppStore((s) => s.currentIncident);
  const hasPermission = useAppStore((s) => s.hasPermission);

  const navSections = incidentId ? buildNavSections(incidentId) : [];

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  // Nom de l'incident : depuis le store (sélectionné) ou depuis l'URL (rechargement)
  const incidentName =
    currentIncident != null && currentIncident.id === incidentId
      ? currentIncident.name
      : incidentId ?? "";

  return (
    <aside className="w-64 bg-white dark:bg-[#0a0b0d] border-r border-gray-200 dark:border-[#1e2229] flex flex-col h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200 dark:border-[#1e2229]">
        <h1 className="text-xl text-gray-900 dark:text-white">Open Crisis</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestion de crise</p>
      </div>

      {/* Incident courant */}
      {incidentId && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#1e2229]">
          <Link
            to="/incidents"
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Changer d'incident
          </Link>
          <p className="text-xs text-white mt-1.5 truncate font-medium" title={incidentName}>
            {incidentName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.permission || hasPermission(item.permission)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="mb-6">
              <div className="px-6 mb-2">
                <h3 className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500">
                  {section.title}
                </h3>
              </div>
              <ul>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className={
                          isActive
                            ? "flex items-center gap-3 px-6 py-2.5 border-l-2 border-blue-500 bg-gray-100 dark:bg-[#1e2229] text-gray-900 dark:text-white transition-colors"
                            : "flex items-center gap-3 px-6 py-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#13151a] hover:text-gray-900 dark:hover:text-white transition-colors"
                        }
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Footer — utilisateur + actions */}
      <div className="border-t border-gray-200 dark:border-[#1e2229]">
        {/* Info utilisateur */}
        {currentUser && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-[#1e2229]">
            <p className="text-sm text-gray-900 dark:text-white font-medium truncate">
              {currentUser.firstName} {currentUser.lastName}
            </p>
            <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
            {currentUser.roles[0] && (
              <p className="text-xs text-blue-400 mt-0.5">{currentUser.roles[0].name}</p>
            )}
          </div>
        )}

        <div className="p-4 space-y-1">
          {/* Déconnexion */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

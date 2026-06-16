import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import {
  LayoutDashboard,
  Users,
  Library,
  FileText,
  Clock,
  ChevronLeft,
  LogOut,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useLogout } from "../../hooks/useLogout";
import { useMediaQuery } from "../../hooks/useMediaQuery";

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

const COLLAPSE_STORAGE_KEY = "sidebar-collapsed";

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
  const { incidentId } = useParams<{ incidentId: string }>();
  const handleLogout = useLogout();
  const currentUser = useAppStore((s) => s.currentUser);
  const currentIncident = useAppStore((s) => s.currentIncident);
  const hasPermission = useAppStore((s) => s.hasPermission);

  // Replié manuellement (persisté) OU forcé sous le seuil tablette (< 1024px)
  const isTablet = useMediaQuery("(max-width: 1023px)");
  const [userCollapsed, setUserCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true"
  );
  const collapsed = isTablet || userCollapsed;

  function toggleCollapsed() {
    setUserCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }

  const navSections = incidentId ? buildNavSections(incidentId) : [];

  // Nom de l'incident : depuis le store (sélectionné) ou depuis l'URL (rechargement)
  const incidentName =
    currentIncident != null && currentIncident.id === incidentId
      ? currentIncident.name
      : incidentId ?? "";

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-64"
      } bg-white dark:bg-[#0a0b0d] border-r border-gray-200 dark:border-[#1e2229] flex flex-col h-screen transition-[width] duration-200`}
    >
      {/* Logo + bouton replier */}
      <div className={`flex items-center border-b border-gray-200 dark:border-[#1e2229] ${collapsed ? "justify-center p-4" : "justify-between px-6 py-5"}`}>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-xl text-gray-900 dark:text-white truncate">Open Crisis</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestion de crise</p>
          </div>
        )}
        {!isTablet && (
          <button
            onClick={toggleCollapsed}
            aria-label={userCollapsed ? "Déplier la navigation" : "Replier la navigation"}
            title={userCollapsed ? "Déplier" : "Replier"}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#1e2229] transition-colors flex-shrink-0"
          >
            {userCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        )}
      </div>

      {/* Incident courant */}
      {incidentId && (
        <div className={`border-b border-gray-200 dark:border-[#1e2229] ${collapsed ? "p-2 flex justify-center" : "px-4 py-3"}`}>
          {collapsed ? (
            <Link
              to="/incidents"
              aria-label="Changer d'incident"
              title={`${incidentName} — Changer d'incident`}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#1e2229] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/incidents"
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Changer d'incident
              </Link>
              <p className="text-xs text-gray-900 dark:text-white mt-1.5 truncate font-medium" title={incidentName}>
                {incidentName}
              </p>
            </>
          )}
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
              {!collapsed && (
                <div className="px-6 mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500">
                    {section.title}
                  </h3>
                </div>
              )}
              <ul>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  const base = "flex items-center gap-3 py-2.5 transition-colors";
                  const layout = collapsed ? "justify-center px-0 mx-2 rounded-lg" : "px-6 border-l-2";
                  const active = isActive
                    ? collapsed
                      ? "bg-gray-100 dark:bg-[#1e2229] text-gray-900 dark:text-white"
                      : "border-blue-500 bg-gray-100 dark:bg-[#1e2229] text-gray-900 dark:text-white"
                    : collapsed
                      ? "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#13151a] hover:text-gray-900 dark:hover:text-white"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#13151a] hover:text-gray-900 dark:hover:text-white";
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        className={`${base} ${layout} ${active}`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
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
        {currentUser && !collapsed && (
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

        <div className={collapsed ? "p-2" : "p-4 space-y-1"}>
          {/* Déconnexion */}
          <button
            onClick={handleLogout}
            aria-label="Se déconnecter"
            title={collapsed ? "Se déconnecter" : undefined}
            className={`flex items-center gap-3 w-full rounded-lg text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors text-sm ${
              collapsed ? "justify-center p-2" : "px-3 py-2"
            }`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Se déconnecter</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}

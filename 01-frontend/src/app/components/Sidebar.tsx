import { Link, useLocation, useParams } from "react-router";
import {
  LayoutDashboard,
  Users,
  Library,
  FileText,
  Clock,
  Sun,
  Moon,
  ChevronLeft,
} from "lucide-react";
import { useTheme } from "next-themes";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
        { path: `${base}/dashboard`, label: "Tableau de bord", icon: LayoutDashboard },
        { path: `${base}/annuaire`, label: "Annuaire", icon: Users },
        { path: `${base}/bibliotheque`, label: "Bibliothèque", icon: Library },
      ],
    },
    {
      title: "Cellule de Direction",
      items: [
        { path: `${base}/main-courante-direction`, label: "Main courante", icon: FileText },
      ],
    },
    {
      title: "Cellule opérationnelle",
      items: [
        { path: `${base}/main-courante-operationnelle`, label: "Main courante", icon: FileText },
        { path: `${base}/timeline`, label: "Timeline", icon: Clock },
      ],
    },
  ];
}

export default function Sidebar() {
  const location = useLocation();
  const { incidentId } = useParams<{ incidentId: string }>();
  const { theme, setTheme } = useTheme();

  const navSections = incidentId ? buildNavSections(incidentId) : [];

  return (
    <aside className="w-64 bg-white dark:bg-[#0a0b0d] border-r border-gray-200 dark:border-[#1e2229] flex flex-col h-screen">
      <div className="p-6 border-b border-gray-200 dark:border-[#1e2229]">
        <h1 className="text-xl text-gray-900 dark:text-white">Open Crisis</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestion de crise</p>
      </div>

      {incidentId && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#1e2229]">
          <Link
            to="/incidents"
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Changer d'incident
          </Link>
          <p className="text-xs text-gray-400 mt-1.5 truncate font-medium">
            #{incidentId}
          </p>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section) => (
          <div key={section.title} className="mb-6">
            <div className="px-6 mb-2">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500">
                {section.title}
              </h3>
            </div>
            <ul>
              {section.items.map((item) => {
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
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-[#1e2229]">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#13151a] hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {theme === "dark" ? (
            <>
              <Sun className="w-5 h-5" />
              <span>Mode clair</span>
            </>
          ) : (
            <>
              <Moon className="w-5 h-5" />
              <span>Mode sombre</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

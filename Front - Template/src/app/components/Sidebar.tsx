import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Users,
  Map,
  FileText,
  Clock,
  FileSearch,
  Sun,
  Moon,
  StickyNote,
  Library,
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

const navigationSections: NavSection[] = [
  {
    title: "Vue d'ensemble",
    items: [
      { path: "/annuaire", label: "Annuaire", icon: Users },
      { path: "/bibliotheque", label: "Bibliothèque", icon: Library },
    ],
  },
  {
    title: "Cellule de Direction",
    items: [
      { path: "/main-courante-direction", label: "Main courante", icon: FileText },
    ],
  },
  {
    title: "Cellule opérationnelle",
    items: [
      { path: "/main-courante-operationnelle", label: "Main courante", icon: FileText },
      { path: "/timeline", label: "Timeline", icon: Clock },
    ],
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <aside className="w-64 bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-white border-r border-[#1e2229] dark:border-[#1e2229] border-gray-200 flex flex-col h-screen">
      {/* Logo / Header */}
      <div className="p-6 border-b border-[#1e2229] dark:border-[#1e2229] border-gray-200">
        <h1 className="text-xl text-gray-900 dark:text-white">Open Crisis</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Gestion de crise</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navigationSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            <div className="px-6 mb-2">
              <h3 className="text-xs uppercase text-gray-500 dark:text-gray-500 text-gray-600 tracking-wider">
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
                      className={`
                        flex items-center gap-3 px-6 py-2.5 transition-colors
                        ${isActive
                          ? 'bg-[#1e2229] dark:bg-[#1e2229] bg-gray-100 text-gray-900 dark:text-white border-l-2 border-blue-500'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-[#13151a] dark:hover:bg-[#13151a] hover:bg-gray-50 hover:text-gray-900 dark:hover:text-white'
                        }
                      `}
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

      {/* Theme Toggle */}
      <div className="p-4 border-t border-[#1e2229] dark:border-[#1e2229] border-gray-200">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-3 w-full px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-[#13151a] dark:hover:bg-[#13151a] hover:bg-gray-50 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
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
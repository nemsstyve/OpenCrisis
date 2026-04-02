import { Server, Database, Globe, Shield, HardDrive, Cloud, Network } from "lucide-react";
import { useState } from "react";

interface SystemNode {
  id: string;
  name: string;
  type: "server" | "database" | "application" | "firewall" | "storage" | "cloud" | "network";
  status: "operational" | "warning" | "critical" | "offline";
  x: number;
  y: number;
  connections: string[];
}

const systemNodes: SystemNode[] = [
  { id: "fw-1", name: "Firewall Principal", type: "firewall", status: "operational", x: 50, y: 20, connections: ["web-1", "web-2"] },
  { id: "web-1", name: "Serveur Web 1", type: "server", status: "operational", x: 20, y: 40, connections: ["app-1"] },
  { id: "web-2", name: "Serveur Web 2", type: "server", status: "operational", x: 80, y: 40, connections: ["app-2"] },
  { id: "app-1", name: "App Server 1", type: "application", status: "warning", x: 30, y: 60, connections: ["db-1", "cache-1"] },
  { id: "app-2", name: "App Server 2", type: "application", status: "operational", x: 70, y: 60, connections: ["db-1", "cache-1"] },
  { id: "db-1", name: "Database Principal", type: "database", status: "critical", x: 35, y: 80, connections: ["storage-1"] },
  { id: "cache-1", name: "Cache Redis", type: "database", status: "operational", x: 65, y: 80, connections: [] },
  { id: "storage-1", name: "Storage NAS", type: "storage", status: "operational", x: 20, y: 95, connections: [] },
  { id: "cloud-1", name: "Cloud Backup", type: "cloud", status: "operational", x: 80, y: 95, connections: [] },
];

const typeIcons = {
  server: Server,
  database: Database,
  application: Globe,
  firewall: Shield,
  storage: HardDrive,
  cloud: Cloud,
  network: Network,
};

const statusColors = {
  operational: { bg: "bg-green-500", border: "border-green-500", text: "text-green-400" },
  warning: { bg: "bg-orange-500", border: "border-orange-500", text: "text-orange-400" },
  critical: { bg: "bg-red-500", border: "border-red-500", text: "text-red-400" },
  offline: { bg: "bg-gray-500", border: "border-gray-500", text: "text-gray-400" },
};

const statusLabels = {
  operational: "Opérationnel",
  warning: "Alerte",
  critical: "Critique",
  offline: "Hors ligne",
};

export default function Cartographie() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const getConnectedNodes = (nodeId: string): string[] => {
    const node = systemNodes.find((n) => n.id === nodeId);
    if (!node) return [];
    return node.connections;
  };

  const isNodeConnected = (nodeId: string) => {
    if (!selectedNode && !hoveredNode) return false;
    const activeNode = hoveredNode || selectedNode;
    if (activeNode === nodeId) return true;
    const node = systemNodes.find((n) => n.id === activeNode);
    return node?.connections.includes(nodeId) || false;
  };

  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">Cartographie du Système d'Information</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Architecture et état des composants du système
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Composants totaux</h3>
          <p className="text-3xl text-gray-900 dark:text-white">{systemNodes.length}</p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Opérationnels</h3>
          <p className="text-3xl text-green-400">
            {systemNodes.filter((n) => n.status === "operational").length}
          </p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">En alerte</h3>
          <p className="text-3xl text-orange-400">
            {systemNodes.filter((n) => n.status === "warning").length}
          </p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Critiques</h3>
          <p className="text-3xl text-red-400">
            {systemNodes.filter((n) => n.status === "critical").length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Map */}
        <div className="lg:col-span-2 bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-[#1e2229] dark:border-[#1e2229] border-gray-200">
            <h2 className="text-lg text-gray-900 dark:text-white">Cartographie interactive</h2>
          </div>

          <div className="relative h-[700px] bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-gray-100 p-8">
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {systemNodes.map((node) =>
                node.connections.map((targetId) => {
                  const target = systemNodes.find((n) => n.id === targetId);
                  if (!target) return null;

                  const isHighlighted = isNodeConnected(node.id) || isNodeConnected(targetId);

                  return (
                    <line
                      key={`${node.id}-${targetId}`}
                      x1={`${node.x}%`}
                      y1={`${node.y}%`}
                      x2={`${target.x}%`}
                      y2={`${target.y}%`}
                      stroke={isHighlighted ? "#3b82f6" : "#1e2229"}
                      strokeWidth={isHighlighted ? "3" : "2"}
                      strokeDasharray={isHighlighted ? "0" : "5,5"}
                      className="transition-all duration-300"
                    />
                  );
                })
              )}
            </svg>

            {systemNodes.map((node) => {
              const Icon = typeIcons[node.type];
              const isHighlighted = isNodeConnected(node.id);
              const isActive = selectedNode === node.id || hoveredNode === node.id;

              return (
                <div
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <div
                    className={`relative w-16 h-16 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${
                      isActive
                        ? `${statusColors[node.status].border} ${statusColors[node.status].bg} bg-opacity-30 scale-110 shadow-lg`
                        : isHighlighted
                        ? `${statusColors[node.status].border} bg-blue-500/20 scale-105`
                        : `${statusColors[node.status].border} bg-[#13151a] dark:bg-[#13151a] bg-white`
                    }`}
                  >
                    <Icon
                      className={`w-8 h-8 ${
                        isActive || isHighlighted
                          ? statusColors[node.status].text
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                    />
                    {node.status === "critical" && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 px-3 py-2 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                    <p className="text-sm text-gray-900 dark:text-white">{node.name}</p>
                    <p className={`text-xs ${statusColors[node.status].text}`}>
                      {statusLabels[node.status]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Node Details */}
        <div className="space-y-4">
          <h2 className="text-xl mb-4 text-gray-900 dark:text-white">Composants</h2>
          <div className="space-y-3 max-h-[700px] overflow-y-auto">
            {systemNodes.map((node) => {
              const Icon = typeIcons[node.type];
              const isActive = selectedNode === node.id;

              return (
                <div
                  key={node.id}
                  className={`bg-[#13151a] dark:bg-[#13151a] bg-white border rounded-lg p-4 cursor-pointer transition-all ${
                    isActive
                      ? "border-blue-500 ring-2 ring-blue-500/20"
                      : "border-[#1e2229] dark:border-[#1e2229] border-gray-200 hover:border-[#2a2e39] dark:hover:border-[#2a2e39] hover:border-gray-300"
                  }`}
                  onClick={() => setSelectedNode(isActive ? null : node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${statusColors[node.status].bg} bg-opacity-20`}>
                        <Icon className={`w-5 h-5 ${statusColors[node.status].text}`} />
                      </div>
                      <div>
                        <h3 className="text-sm mb-1 text-gray-900 dark:text-white">{node.name}</h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">{node.type}</p>
                      </div>
                    </div>
                    <div
                      className={`w-3 h-3 rounded-full ${statusColors[node.status].bg} ${
                        node.status === "critical" ? "animate-pulse" : ""
                      }`}
                    />
                  </div>
                  <div className="text-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Statut:</span>
                      <span className={statusColors[node.status].text}>
                        {statusLabels[node.status]}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Connexions:</span>
                      <span className="text-gray-900 dark:text-white">{node.connections.length}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

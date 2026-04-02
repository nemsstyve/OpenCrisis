import { Users, Phone, Mail, Search, Plus } from "lucide-react";

const contacts = [
  {
    id: 1,
    name: "Marie Dubois",
    role: "Directrice de crise",
    cell: "Cellule de Direction",
    company: "TechCorp SA",
    site: "Paris - Siège",
    phone: "+33 6 12 34 56 78",
    email: "marie.dubois@company.com",
    status: "available",
  },
  {
    id: 2,
    name: "Jean Martin",
    role: "Chef cellule opérationnelle",
    cell: "Cellule opérationnelle",
    company: "TechCorp SA",
    site: "Paris - Siège",
    phone: "+33 6 23 45 67 89",
    email: "jean.martin@company.com",
    status: "available",
  },
  {
    id: 3,
    name: "Sophie Laurent",
    role: "Responsable communication",
    cell: "Cellule de Direction",
    company: "TechCorp SA",
    site: "Paris - Siège",
    phone: "+33 6 34 56 78 90",
    email: "sophie.laurent@company.com",
    status: "busy",
  },
  {
    id: 4,
    name: "Pierre Dupont",
    role: "Expert technique",
    cell: "Cellule opérationnelle",
    company: "DataTech SARL",
    site: "Lyon - Data Center",
    phone: "+33 6 45 67 89 01",
    email: "pierre.dupont@company.com",
    status: "available",
  },
  {
    id: 5,
    name: "Claire Bernard",
    role: "Analyste sécurité",
    cell: "Cellule opérationnelle",
    company: "SecureIT",
    site: "Paris - Siège",
    phone: "+33 6 56 78 90 12",
    email: "claire.bernard@company.com",
    status: "offline",
  },
  {
    id: 6,
    name: "Thomas Petit",
    role: "Coordinateur logistique",
    cell: "Cellule opérationnelle",
    company: "TechCorp SA",
    site: "Marseille",
    phone: "+33 6 67 89 01 23",
    email: "thomas.petit@company.com",
    status: "available",
  },
  {
    id: 7,
    name: "Isabelle Moreau",
    role: "Responsable juridique",
    cell: "Cellule de Direction",
    company: "TechCorp SA",
    site: "Paris - Siège",
    phone: "+33 6 78 90 12 34",
    email: "isabelle.moreau@company.com",
    status: "available",
  },
  {
    id: 8,
    name: "Lucas Rousseau",
    role: "Analyste risques",
    cell: "Cellule de Direction",
    company: "RiskConsult",
    site: "Lille",
    phone: "+33 6 89 01 23 45",
    email: "lucas.rousseau@company.com",
    status: "busy",
  },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  available: { label: "Disponible", color: "bg-green-500" },
  busy: { label: "Occupé", color: "bg-orange-500" },
  offline: { label: "Hors ligne", color: "bg-gray-500" },
};

export default function Annuaire() {
  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">Annuaire</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Répertoire des membres de la cellule de crise
          </p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-5 h-5" />
          Ajouter un contact
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="text-gray-600 dark:text-gray-400 text-sm">Total contacts</h3>
          </div>
          <p className="text-3xl text-gray-900 dark:text-white">{contacts.length}</p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Disponibles</h3>
          <p className="text-3xl text-green-400">
            {contacts.filter((c) => c.status === "available").length}
          </p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Occupés</h3>
          <p className="text-3xl text-orange-400">
            {contacts.filter((c) => c.status === "busy").length}
          </p>
        </div>
        <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
          <h3 className="text-gray-600 dark:text-gray-400 text-sm mb-2">Hors ligne</h3>
          <p className="text-3xl text-gray-400">
            {contacts.filter((c) => c.status === "offline").length}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un contact..."
            className="w-full bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg pl-10 pr-4 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0b0d] dark:bg-[#0a0b0d] bg-gray-100 border-b border-[#1e2229] dark:border-[#1e2229] border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Nom
                </th>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Rôle
                </th>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Cellule
                </th>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Entreprise
                </th>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Site
                </th>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Téléphone
                </th>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-sm text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2229] dark:divide-[#1e2229] divide-gray-200">
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="hover:bg-[#1a1d24] dark:hover:bg-[#1a1d24] hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500/10 dark:bg-blue-500/10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-400 dark:text-blue-400 text-blue-600">
                          {contact.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                      </div>
                      <div className="text-sm text-gray-900 dark:text-white">{contact.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                    {contact.role}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {contact.cell}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                    {contact.company}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {contact.site}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                    >
                      <Phone className="w-4 h-4" />
                      {contact.phone}
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                    >
                      <Mail className="w-4 h-4" />
                      {contact.email}
                    </a>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          statusConfig[contact.status].color
                        }`}
                      />
                      <span className="text-gray-700 dark:text-gray-300">
                        {statusConfig[contact.status].label}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { AlertTriangle, Clock } from "lucide-react";
import { useState, useEffect } from "react";

interface TimelineEvent {
  id: number;
  title: string;
  date: Date;
  type: "crisis" | "current" | "milestone";
}

interface Member {
  id: number;
  name: string;
  role: string;
  avatar: string;
  activeMinutes: number;
}

const timelineEvents: TimelineEvent[] = [
  {
    id: 1,
    title: "Déclenchement de la crise",
    date: new Date("2026-02-19T14:25:00"),
    type: "crisis",
  },
  {
    id: 2,
    title: "Date actuelle",
    date: new Date(),
    type: "current",
  },
  {
    id: 3,
    title: "Réunion de crise",
    date: new Date("2026-02-19T16:00:00"),
    type: "milestone",
  },
  {
    id: 4,
    title: "Point de situation",
    date: new Date("2026-02-19T18:00:00"),
    type: "milestone",
  },
];

const directionMembers: Member[] = [
  { id: 1, name: "Marie Dubois", role: "Directrice", avatar: "MD", activeMinutes: 145 },
  { id: 2, name: "Sophie Laurent", role: "Communication", avatar: "SL", activeMinutes: 130 },
  { id: 3, name: "Isabelle Moreau", role: "Juridique", avatar: "IM", activeMinutes: 120 },
  { id: 4, name: "Lucas Rousseau", role: "Risques", avatar: "LR", activeMinutes: 95 },
];

const operationalMembers: Member[] = [
  { id: 1, name: "Jean Martin", role: "Chef cellule", avatar: "JM", activeMinutes: 150 },
  { id: 2, name: "Pierre Dupont", role: "Expert technique", avatar: "PD", activeMinutes: 140 },
  { id: 3, name: "Claire Bernard", role: "Analyste sécurité", avatar: "CB", activeMinutes: 125 },
  { id: 4, name: "Thomas Petit", role: "Coordinateur", avatar: "TP", activeMinutes: 110 },
];

function MemberWidget({ title, members, color }: { title: string; members: Member[]; color: string }) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-6">
      <h2 className="text-xl mb-6 text-gray-900 dark:text-white">{title}</h2>
      <div className="grid grid-cols-2 gap-6">
        {members.map((member) => {
          const progress = (member.activeMinutes / 180) * 360;
          return (
            <div key={member.id} className="flex flex-col items-center">
              <div className="relative mb-3">
                <svg className="w-24 h-24 -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-gray-700 dark:text-gray-700 text-gray-200"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className={color}
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 - (progress / 360) * 2 * Math.PI * 40}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-blue-500/10 dark:bg-blue-500/10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-400 dark:text-blue-400 text-blue-600">{member.avatar}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-center mb-1 text-gray-900 dark:text-white">{member.name}</p>
              <p className="text-xs text-center text-gray-600 dark:text-gray-400">{member.role}</p>
              <p className="text-xs text-center text-gray-500 dark:text-gray-500 text-gray-400 mt-1">
                {member.activeMinutes} min actif
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const sortedEvents = [...timelineEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
  const minDate = sortedEvents[0].date.getTime();
  const maxDate = sortedEvents[sortedEvents.length - 1].date.getTime();

  return (
    <div className="p-8 bg-[#0f1116] dark:bg-[#0f1116] bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl mb-2 text-gray-900 dark:text-white">Tableau de bord</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Vue d'ensemble de la situation de crise actuelle
        </p>
      </div>

      {/* Timeline */}
      <div className="bg-[#13151a] dark:bg-[#13151a] bg-white border border-[#1e2229] dark:border-[#1e2229] border-gray-200 rounded-lg p-8 mb-8">
        <h2 className="text-xl mb-8 text-gray-900 dark:text-white">Frise chronologique</h2>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-[#1e2229] dark:bg-[#1e2229] bg-gray-200 -translate-y-1/2" />

          {/* Events */}
          <div className="relative flex justify-between items-center">
            {sortedEvents.map((event, index) => {
              const isFirst = index === 0;
              const isLast = index === sortedEvents.length - 1;
              const isCurrent = event.type === "current";

              return (
                <div
                  key={event.id}
                  className="flex flex-col items-center"
                  style={{ flex: isFirst || isLast ? "0 0 auto" : "1 1 0" }}
                >
                  <div className="relative z-10 mb-4">
                    {isCurrent ? (
                      <div className="w-6 h-6 bg-green-500 rounded-full animate-pulse flex items-center justify-center">
                        <div className="w-3 h-3 bg-white rounded-full" />
                      </div>
                    ) : event.type === "crisis" ? (
                      <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <Clock className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="text-center max-w-[150px]">
                    <p className="text-sm mb-1 text-gray-900 dark:text-white">{event.title}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {event.date.toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Member Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <MemberWidget
          title="Cellule de Direction"
          members={directionMembers}
          color="text-purple-500"
        />
        <MemberWidget
          title="Cellule opérationnelle"
          members={operationalMembers}
          color="text-blue-500"
        />
      </div>
    </div>
  );
}

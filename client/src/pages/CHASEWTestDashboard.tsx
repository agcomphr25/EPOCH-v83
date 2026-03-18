import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, HardDrive, Users, GitBranch } from 'lucide-react';
import { Link } from 'wouter';
import PipelineBoardWidget from '@/components/widgets/PipelineBoardWidget';

const navCards = [
  {
    href: '/projects',
    icon: FolderKanban,
    iconColor: 'text-blue-600',
    hoverBorder: 'hover:border-blue-200',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    title: 'Projects',
    subtitle: 'View and manage all projects',
  },
  {
    href: '/media-library',
    icon: HardDrive,
    iconColor: 'text-violet-600',
    hoverBorder: 'hover:border-violet-200',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    title: 'Central Storage',
    subtitle: 'Media library & reference docs',
  },
  {
    href: '/p2-control-center',
    icon: Users,
    iconColor: 'text-emerald-600',
    hoverBorder: 'hover:border-emerald-200',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    title: 'P2 Customers',
    subtitle: 'P2 Control Center & customers',
  },
];

export default function CHASEWTestDashboard() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Chase's Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Welcome back{currentUser?.username ? `, ${currentUser.username}` : ''}
          </p>
        </div>
        <div className="text-sm text-gray-400 dark:text-gray-500">
          EPOCH Manufacturing ERP
        </div>
      </div>

      {/* Quick Nav Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {navCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className={`hover:shadow-lg transition-all cursor-pointer border-2 ${card.hoverBorder} h-full`}>
              <CardContent className="p-5 flex flex-col items-center text-center">
                <div className={`p-3 rounded-xl ${card.bg} mb-3`}>
                  <card.icon className={`w-7 h-7 ${card.iconColor}`} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {card.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {card.subtitle}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Projects Pipeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-5 w-5 text-blue-600" />
            Projects Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PipelineBoardWidget />
        </CardContent>
      </Card>
    </div>
  );
}

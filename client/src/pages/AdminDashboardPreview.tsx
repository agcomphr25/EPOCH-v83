import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import type { IconType } from 'react-icons';
import {
  FiArchive,
  FiBox,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiCompass,
  FiDollarSign,
  FiEdit3,
  FiGrid,
  FiHelpCircle,
  FiHome,
  FiMessageCircle,
  FiMonitor,
  FiSearch,
  FiShield,
  FiTruck,
  FiUser,
  FiUsers,
} from 'react-icons/fi';
import AccessDenied from '@/pages/AccessDenied';

type DashboardArea = {
  label: string;
  icon: IconType;
};

type DashboardGroup = {
  title: string;
  areas: DashboardArea[];
};

const dashboardGroups: DashboardGroup[] = [
  {
    title: 'Operations',
    areas: [
      { label: 'General', icon: FiGrid },
      { label: 'P1 (Stocks)', icon: FiBox },
      { label: 'P2 (Aerospace Projects)', icon: FiTruck },
      { label: 'Inventory', icon: FiArchive },
      { label: 'Storage', icon: FiHome },
    ],
  },
  {
    title: 'People & Knowledge',
    areas: [
      { label: 'Communication', icon: FiMessageCircle },
      { label: 'Employee', icon: FiUser },
      { label: 'Training', icon: FiUsers },
      { label: 'Timekeeping', icon: FiClock },
    ],
  },
  {
    title: 'Quality & Business',
    areas: [
      { label: 'Design', icon: FiEdit3 },
      { label: 'QMS', icon: FiShield },
      { label: 'Finance', icon: FiDollarSign },
      { label: 'Overview', icon: FiCompass },
      { label: 'System', icon: FiMonitor },
    ],
  },
];

type CurrentUser = {
  id: number;
  username: string;
  role: string;
};

function getDisplayName(username: string) {
  return username
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function AdminDashboardPreview() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const { data: currentUser, isLoading } = useQuery<CurrentUser | null>({
    queryKey: ['currentUser'],
  });

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return dashboardGroups;

    return dashboardGroups
      .map((group) => ({
        ...group,
        areas: group.areas.filter((area) =>
          area.label.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.areas.length > 0);
  }, [query]);

  if (!isLoading && currentUser && !['ADMIN', 'OWNER'].includes(currentUser.role.toUpperCase())) {
    return <AccessDenied />;
  }

  const displayName = getDisplayName(currentUser?.username || 'Admin');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-[150px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <button
            type="button"
            onClick={() => setLocation('/admin-dashboard')}
            className="px-6 py-8 text-left text-xl font-bold tracking-tight text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            aria-label="Return to current admin dashboard"
          >
            EPOCH <span className="text-sm">v8</span>
          </button>

          <div className="mt-auto flex flex-col items-center gap-7 pb-9 text-slate-500">
            <button type="button" className="rounded-lg p-2 hover:bg-slate-100 hover:text-blue-600" aria-label="Help">
              <FiHelpCircle className="h-6 w-6" />
            </button>
            <button type="button" className="rounded-lg p-2 hover:bg-slate-100 hover:text-blue-600" aria-label="Account">
              <FiUser className="h-6 w-6" />
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white">
            <div className="flex min-h-[106px] flex-col gap-5 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:px-14 lg:py-0">
              <div className="flex min-w-fit items-center justify-between lg:block">
                <button
                  type="button"
                  onClick={() => setLocation('/admin-dashboard')}
                  className="text-lg font-bold tracking-tight text-blue-600 lg:hidden"
                >
                  EPOCH v8
                </button>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  Admin workspace
                </h1>
              </div>

              <label className="relative mx-auto w-full max-w-[470px]">
                <span className="sr-only">Find an area</span>
                <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find an area"
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white pl-12 pr-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <button
                type="button"
                className="hidden min-w-fit items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:flex"
                aria-label={`Account menu for ${displayName}`}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
                <span>{displayName}</span>
                <FiChevronDown className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-8 lg:px-14 lg:py-12">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Dashboard preview</p>
                <p className="mt-1 text-sm text-slate-500">
                  Choose an area. Module links will be assigned later.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocation('/admin-dashboard')}
                className="hidden rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700 sm:block"
              >
                Current dashboard
              </button>
            </div>

            {filteredGroups.length > 0 ? (
              <div className="space-y-11">
                {filteredGroups.map((group) => (
                  <section key={group.title} aria-labelledby={`${group.title}-heading`}>
                    <h2
                      id={`${group.title}-heading`}
                      className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-700"
                    >
                      {group.title}
                    </h2>
                    <div
                      className={`grid gap-4 sm:grid-cols-2 ${
                        group.areas.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-5'
                      }`}
                    >
                      {group.areas.map((area) => {
                        const Icon = area.icon;
                        const isSelected = selectedArea === area.label;

                        return (
                          <button
                            key={area.label}
                            type="button"
                            onClick={() => setSelectedArea(isSelected ? null : area.label)}
                            aria-pressed={isSelected}
                            className={`group flex min-h-[132px] items-center gap-4 rounded-xl border bg-white px-5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                              isSelected
                                ? 'border-blue-500 ring-2 ring-blue-100'
                                : 'border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md'
                            }`}
                          >
                            <Icon className="h-8 w-8 shrink-0 text-blue-600" aria-hidden="true" />
                            <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800">
                              {area.label}
                            </span>
                            <FiChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                <FiSearch className="mx-auto h-8 w-8 text-slate-400" />
                <h2 className="mt-4 text-lg font-semibold text-slate-800">No areas found</h2>
                <p className="mt-1 text-sm text-slate-500">Try a different search term.</p>
              </div>
            )}

            {selectedArea && (
              <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900" role="status">
                <span className="font-semibold">{selectedArea}</span> is ready for its module links to be assigned.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

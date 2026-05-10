import { Link, useLocation } from 'wouter';
import {
  ShieldCheck, Crown, Bug, BarChart3,
  AlertOctagon, Wrench, Clock, Tags, FileCheck2, Percent,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',        path: '/admin/edri',                    icon: ShieldCheck   },
  { label: 'Executive Matrix', path: '/admin/edri/executive-matrix',   icon: Crown         },
  { label: 'DCAA Findings',    path: '/admin/dcaa-findings',           icon: Bug           },
  { label: 'Charge Codes',      path: '/admin/edri/charge-code-usage',  icon: Tags          },
  { label: 'Payroll Recon',     path: '/admin/edri/payroll-export-reconciliation', icon: FileCheck2 },
  { label: 'Burden Rates',      path: '/admin/edri/indirect-cost-burden-rates', icon: Percent },
  { label: 'Heatmap',          path: '/admin/edri/heatmap',            icon: BarChart3     },
  { label: 'Red Flags',        path: '/admin/edri/red-flags',          icon: AlertOctagon  },
  { label: 'Remediation',      path: '/admin/edri/remediation',        icon: Wrench        },
  { label: 'Score History',    path: '/admin/edri/history',            icon: Clock         },
];

export default function EdriSubNav() {
  const [location] = useLocation();

  // Exact match for dashboard; prefix match for everything else so that
  // sub-routes like /admin/edri/domain/TIMEKEEPING still highlight the right tab.
  function isActive(path: string): boolean {
    if (path === '/admin/edri') return location === '/admin/edri';
    return location.startsWith(path);
  }

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-border/60 mb-2"
      aria-label="EDRI navigation"
    >
      {NAV_ITEMS.map(({ label, path, icon: Icon }) => {
        const active = isActive(path);
        return (
          <Link key={path} href={path}>
            <span
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
                whitespace-nowrap transition-colors cursor-pointer select-none
                ${active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'}
              `}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

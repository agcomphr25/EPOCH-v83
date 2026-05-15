import { Link, useLocation } from 'wouter';
import {
  ShieldCheck, Crown, Bug, BarChart3,
  AlertOctagon, Wrench, Clock, Tags, FileCheck2, Percent, ClipboardCheck,
  ChevronDown, ShoppingCart, Boxes, Fingerprint, BookOpenCheck, UsersRound, UserCheck, ClipboardPenLine, Network,
  FolderOpen,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',        path: '/admin/edri',                    icon: ShieldCheck   },
  { label: 'Executive Matrix', path: '/admin/edri/executive-matrix',   icon: Crown         },
  { label: 'DCAA Findings',    path: '/admin/dcaa-findings',           icon: Bug           },
  { label: 'Heatmap',          path: '/admin/edri/heatmap',            icon: BarChart3     },
  { label: 'Red Flags',        path: '/admin/edri/red-flags',          icon: AlertOctagon  },
  { label: 'Remediation',      path: '/admin/edri/remediation',        icon: Wrench        },
  { label: 'Score History',    path: '/admin/edri/history',            icon: Clock         },
];

const REPORT_ITEMS: NavItem[] = [
  { label: 'Charge Code Usage', path: '/admin/edri/charge-code-usage',  icon: Tags          },
  { label: 'Labor Distribution', path: '/admin/edri/labor-distribution', icon: UsersRound    },
  { label: 'Evidence Map',       path: '/admin/edri/transaction-evidence-map', icon: Network },
  { label: 'Supervisor Exceptions', path: '/admin/edri/supervisor-approval-exceptions', icon: UserCheck },
  { label: 'Correction Log',    path: '/admin/edri/timesheet-correction-log', icon: ClipboardPenLine },
  { label: 'Payroll Recon',     path: '/admin/edri/payroll-export-reconciliation', icon: FileCheck2 },
  { label: 'Burden Rates',      path: '/admin/edri/indirect-cost-burden-rates', icon: Percent },
  { label: 'Unallowables',      path: '/admin/edri/unallowable-cost-review', icon: ClipboardCheck },
  { label: 'Procurement',       path: '/admin/edri/procurement-compliance', icon: ShoppingCart },
  { label: 'Inventory Trace',   path: '/admin/edri/inventory-traceability', icon: Boxes },
  { label: 'Audit Integrity',   path: '/admin/edri/audit-ledger-integrity', icon: Fingerprint },
  { label: 'Policy Training',   path: '/admin/edri/policy-training-acknowledgment', icon: BookOpenCheck },
  { label: 'Supporting Docs',   path: '/admin/edri/supporting-docs', icon: FolderOpen },
];

export default function EdriSubNav() {
  const [location, navigate] = useLocation();

  // Exact match for dashboard; prefix match for everything else so that
  // sub-routes like /admin/edri/domain/TIMEKEEPING still highlight the right tab.
  function isActive(path: string): boolean {
    if (path === '/admin/edri') return location === '/admin/edri';
    return location.startsWith(path);
  }

  const activeReport = REPORT_ITEMS.find((item) => isActive(item.path));
  const ReportsIcon = activeReport?.icon ?? FileCheck2;

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-border/60 mb-2"
      aria-label="EDRI navigation"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium
              whitespace-nowrap transition-colors cursor-pointer select-none
              ${activeReport
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'}
            `}
            aria-current={activeReport ? 'page' : undefined}
          >
            <ReportsIcon className="h-3.5 w-3.5 flex-shrink-0" />
            Reports
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {REPORT_ITEMS.map(({ label, path, icon: Icon }) => {
            const active = isActive(path);
            return (
              <DropdownMenuItem key={path} onSelect={() => navigate(path)}>
                <span
                  className={`flex w-full items-center gap-2 ${active ? 'font-semibold text-foreground' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
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

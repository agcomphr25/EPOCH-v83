import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type TimeRange = 'week' | 'mtd' | 'ytd';
type BusinessContext = 'company' | 'p1' | 'p2';

interface DashboardFilterState {
  timeRange: TimeRange;
  businessContext: BusinessContext;
  setTimeRange: (range: TimeRange) => void;
  setBusinessContext: (ctx: BusinessContext) => void;
}

const DashboardFilterContext = createContext<DashboardFilterState | null>(null);

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRangeState] = useState<TimeRange>('week');
  const [businessContext, setBusinessContextState] = useState<BusinessContext>('company');

  const setTimeRange = useCallback((range: TimeRange) => setTimeRangeState(range), []);
  const setBusinessContext = useCallback((ctx: BusinessContext) => setBusinessContextState(ctx), []);

  return (
    <DashboardFilterContext.Provider
      value={{ timeRange, businessContext, setTimeRange, setBusinessContext }}
    >
      {children}
    </DashboardFilterContext.Provider>
  );
}

export function useDashboardFilters(): DashboardFilterState {
  const ctx = useContext(DashboardFilterContext);
  if (!ctx) {
    throw new Error('useDashboardFilters must be used within a DashboardFilterProvider');
  }
  return ctx;
}

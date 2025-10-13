import React, { useState } from 'react';
import COGSReport from '../components/COGSReport';
import { format, subDays } from 'date-fns';

export default function COGSReportPage() {
  const [range, setRange] = useState(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    return {
      dateFrom: format(thirtyDaysAgo, 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd')
    };
  });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">COGS Report</h1>
      <COGSReport {...range} />
    </div>
  );
}
import MachinedPartRoutingPage from './cnc/MachinedPartRoutingPage';
import { Link } from 'wouter';
import { ChevronLeft } from 'lucide-react';

export default function CNCPartRoutingsPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="border-b bg-white px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <Link href="/cnc-dashboard">
          <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600">
            <ChevronLeft className="w-3.5 h-3.5" />CNC Dashboard
          </button>
        </Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-sm font-semibold text-gray-800">Machined Part Routings</h1>
        <p className="text-xs text-gray-400">Standing machining instruction documents — per-part, per-operation</p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <MachinedPartRoutingPage />
      </div>
    </div>
  );
}

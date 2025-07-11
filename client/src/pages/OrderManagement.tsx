import { Factory, User } from "lucide-react";
import { OrderIDGenerator } from "@/components/OrderIDGenerator";
import { CSVImport } from "@/components/CSVImport";
import { DataDisplay } from "@/components/DataDisplay";
import { TestResults } from "@/components/TestResults";

export default function OrderManagement() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Factory className="h-6 w-6 text-primary mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">EPOCH v8</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Order Management System</span>
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OrderIDGenerator />
          <CSVImport />
        </div>

        <div className="mt-8 space-y-8">
          <DataDisplay />
          <TestResults />
        </div>
      </main>
    </div>
  );
}

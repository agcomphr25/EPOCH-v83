import React from "react";
import { Factory, User } from "lucide-react";
import { OrderIDGenerator } from "@/components/OrderIDGenerator";
import { CSVImport } from "@/components/CSVImport";
import { DataDisplay } from "@/components/DataDisplay";
import { TestResults } from "@/components/TestResults";

export default function OrderManagement() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <OrderIDGenerator />
        <CSVImport />
      </div>

      <div className="mt-8 space-y-8">
        <DataDisplay />
        <TestResults />
      </div>
    </div>
  );
}

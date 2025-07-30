
import React from "react";
import OrderEntryComponent from "@/components/OrderEntry";

export default function OrderEntry() {
  try {
    return <OrderEntryComponent />;
  } catch (error) {
    console.error("OrderEntry page error:", error);
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Order Entry</h2>
          <p className="text-red-600 mb-4">There was an error loading the order entry form.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

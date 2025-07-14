export default function DocumentationPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">EPOCH v8 - System Documentation</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Quick Access</h2>
        <div className="space-y-2">
          <a 
            href="/api/documentation" 
            target="_blank" 
            className="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            View Full Documentation (Raw)
          </a>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">System Overview</h2>
        <p className="text-gray-600 mb-4">
          EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies 
          specializing in customizable products. The system provides end-to-end order management, 
          inventory tracking, quality control, employee management, and dynamic form generation capabilities.
        </p>
        
        <h3 className="text-lg font-semibold mb-2">Key Features:</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>Order Management - Complete order lifecycle from creation to fulfillment</li>
          <li>Inventory Tracking - Real-time inventory management with barcode scanning</li>
          <li>Quality Control - Comprehensive QC workflows with digital signatures</li>
          <li>Employee Portal - Time tracking, onboarding, and task management</li>
          <li>Dynamic Forms - Advanced form builder with signature capture</li>
          <li>Customer Management - CRM functionality with communication tracking</li>
          <li>Reporting & Analytics - Comprehensive reporting with multiple export formats</li>
          <li>Progressive Web App - Mobile-ready with offline capabilities</li>
        </ul>
      </div>
    </div>
  );
}
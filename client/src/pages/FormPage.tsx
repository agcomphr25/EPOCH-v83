import React from 'react';
import { useLocation } from 'wouter';
import FormRenderer from '@/components/FormRenderer';

export default function FormPage() {
  const [location] = useLocation();
  
  // Extract formId from the URL path
  const formId = location.split('/forms/')[1];
  
  // For now, using Admin role - in a real app, this would come from auth
  const userRole = 'Admin';

  if (!formId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Form not found</h1>
          <p className="text-gray-600">The requested form could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <FormRenderer formId={formId} userRole={userRole} />
    </div>
  );
}
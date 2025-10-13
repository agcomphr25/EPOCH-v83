import React from 'react';
import { useLocation } from 'wouter';
import EnhancedFormRenderer from '@/components/EnhancedFormRenderer';

export default function FormRendererPage() {
  const [location] = useLocation();
  
  // Extract form ID from URL path like /forms/:id
  const formId = location.split('/').pop();
  
  if (!formId || isNaN(parseInt(formId))) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-600 mb-4">Invalid Form ID</h1>
          <p className="text-gray-500">Please provide a valid form ID to render the form.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <EnhancedFormRenderer formId={parseInt(formId)} />
    </div>
  );
}
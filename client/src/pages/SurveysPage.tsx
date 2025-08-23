import React from 'react';
import SurveyDashboard from '@/components/SurveyDashboard';

export default function SurveysPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Customer Satisfaction Surveys</h1>
        <p className="text-gray-600 mt-2">
          Collect, manage, and analyze customer feedback to improve your products and services.
        </p>
      </div>
      
      <SurveyDashboard />
    </div>
  );
}
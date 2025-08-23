import React from 'react';
import SurveyAnalytics from '@/components/SurveyAnalytics';

export default function SurveyAnalyticsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Survey Analytics</h1>
        <p className="text-gray-600 mt-2">
          Analyze customer satisfaction trends, identify patterns, and gain insights to improve your business.
        </p>
      </div>
      
      <SurveyAnalytics />
    </div>
  );
}
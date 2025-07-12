import React from 'react';
import { useParams } from 'wouter';
import FormRenderer from '@/components/FormRenderer';

export default function FormPage() {
  const { formId } = useParams<{ formId: string }>();
  
  // In a real app, this would come from authentication context
  const userRole = 'Admin'; // Default role for demonstration
  
  return <FormRenderer formId={formId || ''} userRole={userRole} />;
}
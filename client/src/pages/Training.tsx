import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { GraduationCap, Clock, FileText, Award } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Training() {
  const { data: modules, isLoading } = useQuery({
    queryKey: ['/api/training/modules'],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Training Modules</h1>
          <p className="text-gray-600">
            Employee training and certification programs
          </p>
        </div>
        <div className="text-center py-12">
          <p className="text-gray-500">Loading training modules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1
          className="text-3xl font-bold mb-2 flex items-center gap-2"
          data-testid="text-page-title"
        >
          <GraduationCap className="h-8 w-8 text-primary" />
          Training Modules
        </h1>
        <p className="text-gray-600">
          Complete training modules and earn certifications
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.isArray(modules) &&
          modules.map((module: any) => (
            <Card
              key={module.id}
              className="hover:shadow-lg transition-shadow"
              data-testid={`card-training-module-${module.id}`}
            >
              <CardHeader>
                <CardTitle className="flex items-start gap-2">
                  <FileText className="h-5 w-5 text-primary mt-1" />
                  <span>{module.title}</span>
                </CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>
                      Estimated Time: {module.estimatedMinutes || 30} minutes
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Award className="h-4 w-4" />
                    <span>Passing Score: {module.passingScore || 80}%</span>
                  </div>

                  <Link href={`/training/${module.id}`}>
                    <Button
                      className="w-full"
                      data-testid={`button-start-training-${module.id}`}
                    >
                      Start Training
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {(!modules || (Array.isArray(modules) && modules.length === 0)) && (
        <div className="text-center py-12">
          <GraduationCap className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">No training modules available</p>
          <p className="text-gray-400 text-sm mt-2">
            Check back later for new training content
          </p>
        </div>
      )}
    </div>
  );
}

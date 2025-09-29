import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Truck, MapPin, Clock } from 'lucide-react';

export default function OutsideProcessingCard() {
  const { data: locations = [] } = useQuery({
    queryKey: ['/api/inventory/outside-processing/locations'],
    queryFn: () => apiRequest('/api/inventory/outside-processing/locations')
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['/api/inventory/outside-processing/jobs'],
    queryFn: () => apiRequest('/api/inventory/outside-processing/jobs')
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Outside Processing</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Vendor processing locations and job tracking
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-500" />
            Processing Locations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {locations.length > 0 ? (
            <div className="space-y-2">
              {locations.map((location: any) => (
                <div key={location.locationId} className="border rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{location.locationName}</span>
                    <Badge variant="outline">{location.processType}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">{location.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No processing locations configured</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-5 w-5 text-green-500" />
            Active Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length > 0 ? (
            <div className="space-y-2">
              {jobs.map((job: any) => (
                <div key={job.jobId} className="border rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{job.jobId}</span>
                    <Badge className={`${job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {job.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>Part: {job.partId}</span>
                    <span>Qty: {job.quantitySent}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {job.expectedReturnDate ? new Date(job.expectedReturnDate).toLocaleDateString() : 'TBD'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active jobs</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
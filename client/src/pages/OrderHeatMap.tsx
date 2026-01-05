import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, MapPin, RefreshCw, Filter, TrendingUp } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

const ALLOWED_USERS = ['glennj', 'agrace', 'tasham'];

interface ZipAggregation {
  zipCode: string;
  city: string;
  state: string;
  count: number;
  lat: number;
  lng: number;
}

interface HeatMapData {
  aggregations: ZipAggregation[];
  totalOrders: number;
  uniqueZips: number;
}

export default function OrderHeatMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const heatLayerRef = useRef<any>(null);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ startDate: '', endDate: '' });

  const { data: currentUser, isLoading: userLoading } = useQuery<{ username: string }>({
    queryKey: ['/api/auth/session'],
  });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedFilters.startDate) params.append('startDate', appliedFilters.startDate);
    if (appliedFilters.endDate) params.append('endDate', appliedFilters.endDate);
    return params.toString();
  }, [appliedFilters]);

  const { data: heatMapData, isLoading: dataLoading, refetch } = useQuery<HeatMapData>({
    queryKey: ['/api/orders/heat-map', queryParams],
    queryFn: async () => {
      const url = queryParams 
        ? `/api/orders/heat-map?${queryParams}` 
        : '/api/orders/heat-map';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch heat map data');
      return res.json();
    },
    enabled: !!currentUser?.username && ALLOWED_USERS.includes(currentUser.username),
  });

  const hasAccess = currentUser?.username && ALLOWED_USERS.includes(currentUser.username);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [hasAccess]);

  useEffect(() => {
    if (!mapInstanceRef.current || !heatMapData?.aggregations) return;

    if (heatLayerRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
    }

    const heatData = heatMapData.aggregations
      .filter(agg => agg.lat && agg.lng)
      .map(agg => [agg.lat, agg.lng, agg.count] as [number, number, number]);

    if (heatData.length > 0) {
      const maxCount = Math.max(...heatData.map(d => d[2]));
      const normalizedData = heatData.map(d => [d[0], d[1], d[2] / maxCount] as [number, number, number]);
      
      heatLayerRef.current = (L as any).heatLayer(normalizedData, {
        radius: 25,
        blur: 15,
        maxZoom: 10,
        max: 1.0,
        gradient: {
          0.0: 'blue',
          0.25: 'cyan',
          0.5: 'lime',
          0.75: 'yellow',
          1.0: 'red'
        }
      }).addTo(mapInstanceRef.current);
    }
  }, [heatMapData]);

  const handleApplyFilters = () => {
    setAppliedFilters({ startDate, endDate });
  };

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setAppliedFilters({ startDate: '', endDate: '' });
  };

  const topZips = useMemo(() => {
    if (!heatMapData?.aggregations) return [];
    return [...heatMapData.aggregations]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [heatMapData]);

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You don't have permission to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MapPin className="h-8 w-8 text-primary" />
            Order Heat Map
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize order distribution by customer location
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={dataLoading}
          data-testid="button-refresh-map"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${dataLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Date Range Filter
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 flex-wrap">
                <div className="space-y-1">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-40"
                    data-testid="input-start-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-40"
                    data-testid="input-end-date"
                  />
                </div>
                <Button onClick={handleApplyFilters} data-testid="button-apply-filters">
                  Apply Filters
                </Button>
                <Button variant="outline" onClick={handleClearFilters} data-testid="button-clear-filters">
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div 
                ref={mapRef} 
                className="h-[500px] w-full rounded-lg"
                style={{ zIndex: 0 }}
                data-testid="map-container"
              />
            </CardContent>
          </Card>

          {dataLoading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Orders</span>
                <span className="text-2xl font-bold">{heatMapData?.totalOrders || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Unique ZIP Codes</span>
                <span className="text-2xl font-bold">{heatMapData?.uniqueZips || 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top 10 Locations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topZips.length === 0 ? (
                <p className="text-muted-foreground text-sm">No data available</p>
              ) : (
                <div className="space-y-2">
                  {topZips.map((zip, index) => (
                    <div 
                      key={zip.zipCode}
                      className="flex justify-between items-center text-sm py-1 border-b last:border-0"
                    >
                      <div>
                        <span className="font-medium">{index + 1}. </span>
                        <span>{zip.city}, {zip.state}</span>
                        <span className="text-muted-foreground ml-1">({zip.zipCode})</span>
                      </div>
                      <span className="font-semibold">{zip.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Legend:</strong> Warmer colors (red, yellow) indicate higher order 
                concentrations. Cooler colors (blue, green) indicate fewer orders.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

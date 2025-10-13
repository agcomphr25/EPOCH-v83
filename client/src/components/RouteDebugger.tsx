import React from 'react';
import { useLocation } from 'wouter';

interface RouteDebuggerProps {
  routes: string[];
}

export function RouteDebugger({ routes }: RouteDebuggerProps) {
  const [location] = useLocation();
  
  React.useEffect(() => {
    console.log('🛣️ Route Debug Info:');
    console.log('Current location:', location);
    console.log('Available routes:', routes.length);
    console.log('Route match found:', routes.includes(location));
    
    if (!routes.includes(location) && location !== '/') {
      console.warn('⚠️ Current route not found in registered routes!');
      console.log('Possible matches:', routes.filter(route => 
        route.includes(location.split('/')[1]) || 
        location.includes(route.split('/')[1])
      ));
    }
  }, [location, routes]);

  // Only show debug info in development
  if (import.meta.env.MODE !== 'development') {
    return null;
  }

  const isRouteRegistered = routes.includes(location);

  return (
    <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs z-50">
      <div>Route: {location}</div>
      <div>Status: {isRouteRegistered ? '✅ Registered' : '❌ Not Found'}</div>
      <div>Total Routes: {routes.length}</div>
    </div>
  );
}

export default RouteDebugger;
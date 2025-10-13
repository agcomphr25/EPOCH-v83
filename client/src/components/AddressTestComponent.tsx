import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function AddressTestComponent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const testAddressAPI = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResults([]);
    
    try {
      const url = `/api/address/autocomplete?query=${encodeURIComponent(query)}`;
      console.log('Making request to:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Success! API response:', data);
      setResults(data);
      
      toast({
        title: 'Success!',
        description: `Found ${data.length} addresses`,
      });
    } catch (error) {
      console.error('Error during API call:', error);
      setError((error as Error).message);
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Address API Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="address-query">Address Query</Label>
          <div className="flex gap-2">
            <Input
              id="address-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter address (e.g., 123 Main Street)"
              onKeyPress={(e) => e.key === 'Enter' && testAddressAPI()}
            />
            <Button 
              onClick={testAddressAPI} 
              disabled={isLoading || !query.trim()}
            >
              {isLoading ? 'Testing...' : 'Test API'}
            </Button>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700">Error: {error}</p>
          </div>
        )}
        
        {results.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <h3 className="font-semibold text-green-800 mb-2">Results ({results.length}):</h3>
            <ul className="space-y-1">
              {results.map((address, index) => (
                <li key={index} className="text-green-700 text-sm">
                  {address}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";

export default function DocumentationPage() {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');

  const { data: documentation, isLoading } = useQuery({
    queryKey: ['/api/documentation'],
    queryFn: async () => {
      const response = await fetch('/api/documentation');
      if (!response.ok) throw new Error('Failed to fetch documentation');
      return response.text();
    }
  });

  const handleDownload = () => {
    if (!documentation) return;
    
    const blob = new Blob([documentation], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EPOCH_v8_Complete_Architecture.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenInNewTab = () => {
    window.open('/api/documentation', '_blank');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              EPOCH v8 - System Architecture
            </h1>
            <p className="text-gray-600">
              Complete system structure and technical documentation
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setViewMode(viewMode === 'preview' ? 'raw' : 'preview')}
            >
              <FileText className="w-4 h-4 mr-2" />
              {viewMode === 'preview' ? 'Raw Markdown' : 'Formatted View'}
            </Button>
            
            <Button
              variant="outline"
              onClick={handleOpenInNewTab}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in New Tab
            </Button>
            
            <Button onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            System Documentation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {viewMode === 'preview' ? (
            <div className="prose prose-lg max-w-none">
              <div 
                className="markdown-content"
                dangerouslySetInnerHTML={{
                  __html: documentation?.replace(/\n/g, '<br/>') || ''
                }}
              />
            </div>
          ) : (
            <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
              <code>{documentation}</code>
            </pre>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Links</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <a href="#system-overview" className="block text-blue-600 hover:underline">
                System Overview
              </a>
              <a href="#technology-stack" className="block text-blue-600 hover:underline">
                Technology Stack
              </a>
              <a href="#database-architecture" className="block text-blue-600 hover:underline">
                Database Architecture
              </a>
              <a href="#module-breakdown" className="block text-blue-600 hover:underline">
                Module Breakdown
              </a>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">System Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Database Tables:</span>
                <span className="font-semibold">25</span>
              </div>
              <div className="flex justify-between">
                <span>Modules:</span>
                <span className="font-semibold">10</span>
              </div>
              <div className="flex justify-between">
                <span>API Endpoints:</span>
                <span className="font-semibold">80+</span>
              </div>
              <div className="flex justify-between">
                <span>Frontend Pages:</span>
                <span className="font-semibold">15+</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Export Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={handleDownload} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Markdown (.md)
              </Button>
              <Button variant="outline" size="sm" className="w-full" disabled>
                PDF Export (Coming Soon)
              </Button>
              <Button variant="outline" size="sm" className="w-full" disabled>
                HTML Export (Coming Soon)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
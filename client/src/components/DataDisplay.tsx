import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableIcon, Download, Inbox, CheckCircle, Clock, Play } from "lucide-react";
import { useCSVImport } from "@/hooks/useCSVImport";

export function DataDisplay() {
  const { data, rowCount } = useCSVImport();

  const handleExport = () => {
    // Convert data to CSV and download
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exported-data.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 mr-1" />;
      case 'in progress':
        return <Clock className="h-3 w-3 mr-1" />;
      case 'queued':
        return <Play className="h-3 w-3 mr-1" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'default';
      case 'in progress':
        return 'secondary';
      case 'queued':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TableIcon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-900">Order Data</h2>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">{rowCount} records</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={data.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  {Object.keys(data[0]).map((header) => (
                    <TableHead key={header} className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, index) => (
                  <TableRow 
                    key={index} 
                    className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    {Object.entries(row).map(([key, value], cellIndex) => (
                      <TableCell key={cellIndex} className="text-sm text-gray-900">
                        {key.toLowerCase().includes('status') ? (
                          <Badge 
                            variant={getStatusBadgeVariant(String(value))}
                            className="inline-flex items-center"
                          >
                            {getStatusIcon(String(value))}
                            {String(value)}
                          </Badge>
                        ) : key.toLowerCase().includes('id') ? (
                          <span className="font-mono">{String(value)}</span>
                        ) : (
                          String(value)
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No data imported yet</h3>
            <p className="text-gray-500 mb-4">Upload a CSV file to see your order data here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

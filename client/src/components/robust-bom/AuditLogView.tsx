import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Clock, 
  User, 
  Edit, 
  Plus, 
  Trash2, 
  AlertTriangle,
  FileText,
  RotateCcw
} from 'lucide-react';
import { useState } from 'react';

interface Part {
  id: string;
  sku: string;
  name: string;
}

interface AuditLogEntry {
  id: string;
  partId: string;
  action: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changeReason?: string;
  createdAt: string;
  createdBy: string;
}

interface AuditLogViewProps {
  selectedPart: Part | null;
}

export function AuditLogView({ selectedPart }: AuditLogViewProps) {
  const [actionFilter, setActionFilter] = useState('ALL');

  // Get audit log data - using authenticated default fetcher
  const { data: auditLog, isLoading } = useQuery<AuditLogEntry[]>({
    queryKey: [`/api/robust-bom/parts/${selectedPart?.id}/audit-log?limit=100`],
    enabled: !!selectedPart?.id
  });

  const filteredAuditLog = auditLog?.filter(entry => 
    actionFilter === 'ALL' || entry.action === actionFilter
  );

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE': return <Plus className="h-4 w-4 text-green-500" />;
      case 'UPDATE': return <Edit className="h-4 w-4 text-blue-500" />;
      case 'DELETE': return <Trash2 className="h-4 w-4 text-red-500" />;
      case 'LIFECYCLE_CHANGE': return <RotateCcw className="h-4 w-4 text-purple-500" />;
      default: return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-green-500';
      case 'UPDATE': return 'bg-blue-500';
      case 'DELETE': return 'bg-red-500';
      case 'LIFECYCLE_CHANGE': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const formatFieldName = (fieldName?: string) => {
    if (!fieldName) return '';
    return fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  if (!selectedPart) {
    return (
      <Card data-testid="card-no-part-selected">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Clock className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Part Selected
          </h3>
          <p className="text-gray-500 text-center">
            Select a part from the Parts Master tab to view its audit trail
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card data-testid="card-audit-log-header">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Audit Trail: {selectedPart.sku}
              </CardTitle>
              <CardDescription>
                {selectedPart.name} - Complete change history and audit trail
              </CardDescription>
            </div>
            
            <div className="flex gap-2">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-48" data-testid="select-action-filter">
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="LIFECYCLE_CHANGE">Lifecycle Change</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Audit Log Entries */}
        <div className="lg:col-span-3">
          <Card data-testid="card-audit-entries">
            <CardHeader>
              <CardTitle className="text-sm">Change History</CardTitle>
              <CardDescription>
                {isLoading ? 'Loading...' : filteredAuditLog ? `${filteredAuditLog.length} entries` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8" data-testid="loading-audit-log">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">Loading audit trail...</p>
                </div>
              ) : filteredAuditLog && filteredAuditLog.length > 0 ? (
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {filteredAuditLog.map((entry) => (
                      <Card 
                        key={entry.id} 
                        className="hover:shadow-sm transition-shadow"
                        data-testid={`audit-entry-${entry.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-1">
                              {getActionIcon(entry.action)}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge 
                                  className={`text-white ${getActionBadgeColor(entry.action)}`}
                                  data-testid={`badge-action-${entry.action}`}
                                >
                                  {entry.action.replace('_', ' ')}
                                </Badge>
                                {entry.fieldName && (
                                  <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {formatFieldName(entry.fieldName)}
                                  </span>
                                )}
                              </div>

                              {/* Change details */}
                              {entry.oldValue || entry.newValue ? (
                                <div className="space-y-1 mb-2">
                                  {entry.oldValue && (
                                    <div className="text-sm">
                                      <span className="text-red-600 dark:text-red-400 font-medium">From:</span>
                                      <span className="ml-2 text-gray-700 dark:text-gray-300" data-testid={`text-old-value-${entry.id}`}>
                                        {entry.oldValue}
                                      </span>
                                    </div>
                                  )}
                                  {entry.newValue && (
                                    <div className="text-sm">
                                      <span className="text-green-600 dark:text-green-400 font-medium">To:</span>
                                      <span className="ml-2 text-gray-700 dark:text-gray-300" data-testid={`text-new-value-${entry.id}`}>
                                        {entry.newValue}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                  {entry.action === 'CREATE' && 'Part was created'}
                                  {entry.action === 'DELETE' && 'Part was deleted'}
                                  {entry.action === 'LIFECYCLE_CHANGE' && 'Lifecycle status changed'}
                                </div>
                              )}

                              {/* Change reason */}
                              {entry.changeReason && (
                                <div className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
                                  <span className="font-medium text-gray-700 dark:text-gray-300">Reason:</span>
                                  <span className="ml-2 text-gray-600 dark:text-gray-400" data-testid={`text-change-reason-${entry.id}`}>
                                    {entry.changeReason}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Timestamp and user */}
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm text-gray-600 dark:text-gray-400" data-testid={`text-created-at-${entry.id}`}>
                                {new Date(entry.createdAt).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-gray-500" data-testid={`text-created-by-${entry.id}`}>
                                {new Date(entry.createdAt).toLocaleTimeString()}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                <User className="h-3 w-3" />
                                {entry.createdBy}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8" data-testid="no-audit-entries">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No audit entries found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {actionFilter !== 'ALL' ? 'Try changing the filter' : 'Changes will appear here when made'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Audit Summary */}
        <div className="space-y-4">
          <Card data-testid="card-audit-summary">
            <CardHeader>
              <CardTitle className="text-sm">Audit Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditLog && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Total Changes:</span>
                      <span className="font-medium" data-testid="text-total-changes">
                        {auditLog.length}
                      </span>
                    </div>

                    {['CREATE', 'UPDATE', 'DELETE', 'LIFECYCLE_CHANGE'].map(action => {
                      const count = auditLog.filter(entry => entry.action === action).length;
                      if (count === 0) return null;
                      
                      return (
                        <div key={action} className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            {getActionIcon(action)}
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {action.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="font-medium" data-testid={`text-action-count-${action}`}>
                            {count}
                          </span>
                        </div>
                      );
                    })}

                    {auditLog.length > 0 && (
                      <>
                        <div className="pt-2 border-t">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">First Change:</span>
                            <span className="text-xs text-gray-500" data-testid="text-first-change">
                              {new Date(auditLog[auditLog.length - 1].createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Last Change:</span>
                            <span className="text-xs text-gray-500" data-testid="text-last-change">
                              {new Date(auditLog[0].createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card data-testid="card-recent-activity">
            <CardHeader>
              <CardTitle className="text-sm">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {auditLog && auditLog.length > 0 ? (
                  auditLog.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                      {getActionIcon(entry.action)}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {entry.action.replace('_', ' ')}
                          {entry.fieldName && ` - ${formatFieldName(entry.fieldName)}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No recent activity
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Compliance Notes */}
          <Card data-testid="card-compliance-notes">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Compliance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                <p>
                  <strong>Audit Trail:</strong> All changes are permanently logged and cannot be modified or deleted.
                </p>
                <p>
                  <strong>Data Retention:</strong> Audit records are retained indefinitely for compliance purposes.
                </p>
                <p>
                  <strong>User Tracking:</strong> All actions are attributed to authenticated users with timestamps.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
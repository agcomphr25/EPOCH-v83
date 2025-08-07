import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, RefreshCw, FileText, Edit } from 'lucide-react';
import useNonconformance from '../hooks/useNonconformance';
import NonconformanceFormModal from './NonconformanceFormModal';
import { format, addDays, parseISO } from 'date-fns';

export default function NonconformanceDashboard() {
  const [filters, setFilters] = useState({ 
    dateFrom: '', 
    dateTo: '', 
    stockModel: '', 
    issueCause: '', 
    status: '', 
    search: '' 
  });
  
  const { records, loading, error, setRecords } = useNonconformance(filters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  const resetFilters = () => {
    setFilters({ 
      dateFrom: '', 
      dateTo: '', 
      stockModel: '', 
      issueCause: '', 
      status: '', 
      search: '' 
    });
  };

  const openEditModal = (record: any) => {
    setEditRecord(record);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditRecord(null);
  };

  const onRecordSaved = () => {
    // Trigger refetch by resetting filters state
    setFilters(prev => ({ ...prev }));
  };

  const getStatusBadge = (record: any) => {
    if (!record.dispositionDate) return { variant: 'secondary' as const, label: 'No Date Set' };
    
    const dueDate = addDays(parseISO(record.dispositionDate), 2);
    const isPastDue = new Date() > dueDate && record.status === 'Open';
    const isResolved = record.status === 'Resolved';
    const resolvedQuickly = isResolved && record.resolvedAt && 
      parseISO(record.resolvedAt) <= dueDate;

    if (resolvedQuickly) {
      return { variant: 'default' as const, label: 'Resolved On-Time' };
    } else if (isPastDue) {
      return { variant: 'destructive' as const, label: 'Overdue' };
    } else if (isResolved) {
      return { variant: 'default' as const, label: 'Resolved' };
    } else {
      return { variant: 'secondary' as const, label: 'In Progress' };
    }
  };

  const issueOptions = [
    'Customer Request for Additional Work',
    'Wrong Inlet/CNC Error', 
    'Does Not Meet Customer QC Requirements',
    'Material Defect',
    'Process Error',
    'Design Issue',
    'Other'
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nonconforming Item Tracking</h1>
          <p className="text-gray-600">Track and manage quality issues and dispositions</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Record
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">
              {records.filter(r => r.status === 'Open').length}
            </div>
            <div className="text-sm text-gray-600">Open Issues</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {records.filter(r => r.status === 'Resolved').length}
            </div>
            <div className="text-sm text-gray-600">Resolved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-600">
              {records.filter(r => {
                if (!r.dispositionDate || r.status !== 'Open') return false;
                const dueDate = addDays(parseISO(r.dispositionDate), 2);
                return new Date() > dueDate;
              }).length}
            </div>
            <div className="text-sm text-gray-600">Overdue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">
              {records.length}
            </div>
            <div className="text-sm text-gray-600">Total Records</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Issue Cause</label>
              <Select value={filters.issueCause} onValueChange={(value) => setFilters(f => ({ ...f, issueCause: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Causes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Causes</SelectItem>
                  {issueOptions.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={filters.status} onValueChange={(value) => setFilters(f => ({ ...f, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <Input
                placeholder="Order ID, Serial, Customer..."
                value={filters.search}
                onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={resetFilters}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Nonconformance Records ({records.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading records...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-red-500">Error loading records: {error}</div>
            </div>
          ) : records.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">No records found</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Order ID</th>
                    <th className="text-left p-2 font-medium">Serial #</th>
                    <th className="text-left p-2 font-medium">Customer</th>
                    <th className="text-left p-2 font-medium">PO #</th>
                    <th className="text-left p-2 font-medium">Stock Model</th>
                    <th className="text-left p-2 font-medium">Qty</th>
                    <th className="text-left p-2 font-medium">Issue Cause</th>
                    <th className="text-left p-2 font-medium">Disposition</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Progress</th>
                    <th className="text-left p-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const statusBadge = getStatusBadge(record);
                    return (
                      <tr key={record.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium text-blue-600">{record.orderId}</td>
                        <td className="p-2">{record.serialNumber}</td>
                        <td className="p-2">{record.customerName}</td>
                        <td className="p-2">{record.poNumber}</td>
                        <td className="p-2">{record.stockModel}</td>
                        <td className="p-2">{record.quantity}</td>
                        <td className="p-2 text-sm">{record.issueCause}</td>
                        <td className="p-2">{record.disposition}</td>
                        <td className="p-2">
                          <Badge variant={record.status === 'Open' ? 'destructive' : 'default'}>
                            {record.status}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Badge variant={statusBadge.variant}>
                            {statusBadge.label}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(record)}
                            className="flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      {modalOpen && (
        <NonconformanceFormModal
          open={modalOpen}
          onClose={closeModal}
          onSaved={onRecordSaved}
          recordToEdit={editRecord}
        />
      )}
    </div>
  );
}
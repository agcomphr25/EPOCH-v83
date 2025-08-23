import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Filter, Download, MessageSquare, TrendingUp, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import SurveyFormModal from './SurveyFormModal';
import type { Survey } from '@shared/schema';

interface SurveyFilters {
  search?: string;
  customerId?: string;
  status?: string;
  npsType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export default function SurveyDashboard() {
  const [filters, setFilters] = useState<SurveyFilters>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);

  // Fetch surveys with filters
  const { data: surveys = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/surveys', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      return await apiRequest(`/api/surveys?${params.toString()}`);
    },
  });

  const openNewSurvey = () => {
    setEditingSurvey(null);
    setModalOpen(true);
  };

  const openEditSurvey = (survey: Survey) => {
    setEditingSurvey(survey);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingSurvey(null);
  };

  const onSurveySaved = () => {
    refetch();
  };

  const updateFilter = (key: keyof SurveyFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  // Get NPS badge color
  const getNpsBadgeVariant = (npsType: string) => {
    switch (npsType) {
      case 'Promoter': return 'default';
      case 'Passive': return 'secondary';
      case 'Detractor': return 'destructive';
      default: return 'outline';
    }
  };

  // Get CSAT color
  const getCsatColor = (score: number) => {
    if (score >= 4) return 'text-green-600';
    if (score >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Calculate summary stats
  const summaryStats = {
    total: surveys.length,
    avgCsat: surveys.length > 0 ? (surveys.reduce((sum: number, s: Survey) => sum + s.csatScore, 0) / surveys.length).toFixed(2) : '0.00',
    promoters: surveys.filter((s: Survey) => s.npsType === 'Promoter').length,
    detractors: surveys.filter((s: Survey) => s.npsType === 'Detractor').length,
    withIssues: surveys.filter((s: Survey) => s.issueExperienced).length,
  };

  const npsScore = surveys.length > 0 
    ? Math.round(((summaryStats.promoters - summaryStats.detractors) / surveys.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Surveys</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg CSAT</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getCsatColor(parseFloat(summaryStats.avgCsat))}`}>
              {summaryStats.avgCsat}
            </div>
            <p className="text-xs text-muted-foreground">Out of 5.0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">NPS Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${npsScore >= 50 ? 'text-green-600' : npsScore >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
              {npsScore}
            </div>
            <p className="text-xs text-muted-foreground">
              {summaryStats.promoters} promoters, {summaryStats.detractors} detractors
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{summaryStats.withIssues}</div>
            <p className="text-xs text-muted-foreground">
              {surveys.length > 0 ? ((summaryStats.withIssues / surveys.length) * 100).toFixed(1) : 0}% of responses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Follow-ups</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {surveys.filter((s: Survey) => s.followUpRequired).length}
            </div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <CardTitle>Customer Satisfaction Surveys</CardTitle>
            <div className="flex gap-2">
              <Button onClick={openNewSurvey} className="gap-2">
                <Plus className="h-4 w-4" />
                New Survey
              </Button>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter Row */}
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by customer name or order ID..."
                  value={filters.search || ''}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filters.status || ''} onValueChange={(value) => updateFilter('status', value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.npsType || ''} onValueChange={(value) => updateFilter('npsType', value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All NPS Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All NPS Types</SelectItem>
                <SelectItem value="Promoter">Promoter</SelectItem>
                <SelectItem value="Passive">Passive</SelectItem>
                <SelectItem value="Detractor">Detractor</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className="w-[150px]"
                placeholder="From"
              />
              <Input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className="w-[150px]"
                placeholder="To"
              />
            </div>
          </div>

          {/* Survey Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Stock Model</TableHead>
                  <TableHead>CSAT</TableHead>
                  <TableHead>NPS</TableHead>
                  <TableHead>NPS Type</TableHead>
                  <TableHead>Total Score</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8">
                      Loading surveys...
                    </TableCell>
                  </TableRow>
                ) : surveys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                      No surveys found. Create your first survey to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  surveys.map((survey: Survey) => (
                    <TableRow key={survey.id} className="hover:bg-gray-50">
                      <TableCell>{new Date(survey.surveyDate).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{survey.customerName}</TableCell>
                      <TableCell>{survey.orderId || '-'}</TableCell>
                      <TableCell>{survey.stockModel || '-'}</TableCell>
                      <TableCell>
                        <span className={`font-medium ${getCsatColor(survey.csatScore)}`}>
                          {survey.csatScore.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{survey.nps}</TableCell>
                      <TableCell>
                        <Badge variant={getNpsBadgeVariant(survey.npsType)}>
                          {survey.npsType}
                        </Badge>
                      </TableCell>
                      <TableCell>{survey.totalScore.toFixed(1)}</TableCell>
                      <TableCell>
                        {survey.issueExperienced ? (
                          <Badge variant="destructive">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={survey.status === 'Completed' ? 'default' : 'secondary'}>
                          {survey.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditSurvey(survey)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Survey Form Modal */}
      <SurveyFormModal
        open={modalOpen}
        onClose={closeModal}
        onSaved={onSurveySaved}
        recordToEdit={editingSurvey}
      />
    </div>
  );
}
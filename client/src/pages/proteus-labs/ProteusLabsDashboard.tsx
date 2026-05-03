import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Plus,
  FlaskConical,
  Clock,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react';

type ProteusPromptSummary = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  usageCount: number | null;
  tags: string[];
};

type ProteusExecutionSummary = {
  id: string;
  promptId: string;
  promptTitle: string;
  executedByDisplayName: string;
  executedAt: string;
  status: string;
};

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'small', label: 'Small' },
  { value: 'feature', label: 'Feature' },
  { value: 'large_architecture', label: 'Large Architecture' },
  { value: 'audit', label: 'Audit' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'skill_builder', label: 'Skill Builder' },
];

const CATEGORY_COLORS: Record<string, string> = {
  small: 'bg-green-100 text-green-800',
  feature: 'bg-blue-100 text-blue-800',
  large_architecture: 'bg-purple-100 text-purple-800',
  audit: 'bg-yellow-100 text-yellow-800',
  emergency: 'bg-red-100 text-red-800',
  deployment: 'bg-orange-100 text-orange-800',
  skill_builder: 'bg-indigo-100 text-indigo-800',
};

function formatCategory(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PromptCard({ prompt, onClick }: { prompt: ProteusPromptSummary; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border border-gray-200"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{prompt.title}</p>
            {prompt.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{prompt.description}</p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[prompt.category] || 'bg-gray-100 text-gray-700'}`}
          >
            {formatCategory(prompt.category)}
          </span>
          {(prompt.usageCount ?? 0) > 0 && (
            <span className="text-xs text-gray-400">{prompt.usageCount} uses</span>
          )}
          {prompt.tags.slice(0, 2).map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProteusLabsDashboard() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const { data: prompts = [], isLoading: promptsLoading } = useQuery<ProteusPromptSummary[]>({
    queryKey: ['/api/proteus-labs/prompts', { search, category }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category !== 'all') params.set('category', category);
      const res = await fetch(`/api/proteus-labs/prompts?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch prompts');
      return res.json();
    },
  });

  const { data: recentPrompts = [] } = useQuery<ProteusPromptSummary[]>({
    queryKey: ['/api/proteus-labs/prompts/recent'],
    queryFn: async () => {
      const res = await fetch('/api/proteus-labs/prompts/recent', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch recent prompts');
      const rows = await res.json() as ProteusPromptSummary[];
      return rows.map((r) => ({ ...r, tags: [] }));
    },
  });

  const { data: mostUsed = [] } = useQuery<ProteusPromptSummary[]>({
    queryKey: ['/api/proteus-labs/prompts/most-used'],
    queryFn: async () => {
      const res = await fetch('/api/proteus-labs/prompts/most-used', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch most used prompts');
      const rows = await res.json() as ProteusPromptSummary[];
      return rows.map((r) => ({ ...r, tags: [] }));
    },
  });

  const { data: recentSuccess = [] } = useQuery<ProteusExecutionSummary[]>({
    queryKey: ['/api/proteus-labs/executions/recent-success'],
    queryFn: async () => {
      const res = await fetch('/api/proteus-labs/executions/recent-success', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch recent successes');
      return res.json();
    },
  });

  const { data: recentFailure = [] } = useQuery<ProteusExecutionSummary[]>({
    queryKey: ['/api/proteus-labs/executions/recent-failure'],
    queryFn: async () => {
      const res = await fetch('/api/proteus-labs/executions/recent-failure', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch recent failures');
      return res.json();
    },
  });

  const isSearching = search.length > 0 || category !== 'all';

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-7 w-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proteus Labs</h1>
            <p className="text-sm text-gray-500">AI Governance Center — Prompt Library</p>
          </div>
        </div>
        <Button onClick={() => setLocation('/proteus-labs/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          New Prompt
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by title, description, body, or tag..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                category === cat.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {isSearching && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Search Results ({prompts.length})
          </h2>
          {promptsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : prompts.length === 0 ? (
            <p className="text-gray-500 text-sm">No prompts match your search.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prompts.map((p) => (
                <PromptCard key={p.id} prompt={p} onClick={() => setLocation(`/proteus-labs/${p.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {!isSearching && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                Recent Prompts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentPrompts.length === 0 ? (
                <p className="text-sm text-gray-400">No prompts yet.</p>
              ) : (
                recentPrompts.map((p) => (
                  <PromptCard key={p.id} prompt={p} onClick={() => setLocation(`/proteus-labs/${p.id}`)} />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                Most Used
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {mostUsed.length === 0 ? (
                <p className="text-sm text-gray-400">No usage data yet.</p>
              ) : (
                mostUsed.map((p) => (
                  <PromptCard key={p.id} prompt={p} onClick={() => setLocation(`/proteus-labs/${p.id}`)} />
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Recent Successful Runs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentSuccess.length === 0 ? (
                  <p className="text-sm text-gray-400">No successful runs yet.</p>
                ) : (
                  recentSuccess.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                      onClick={() => setLocation(`/proteus-labs/${e.promptId}`)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{e.promptTitle}</p>
                        <p className="text-xs text-gray-400">{e.executedByDisplayName}</p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    </div>
                  ))
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-gray-500 mt-1"
                  onClick={() => setLocation('/proteus-labs/history')}
                >
                  View All History
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Recent Failed Runs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentFailure.length === 0 ? (
                  <p className="text-sm text-gray-400">No failed runs.</p>
                ) : (
                  recentFailure.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                      onClick={() => setLocation(`/proteus-labs/${e.promptId}`)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{e.promptTitle}</p>
                        <p className="text-xs text-gray-400">{e.executedByDisplayName}</p>
                      </div>
                      <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {!isSearching && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">All Prompts</h2>
          {promptsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No prompts yet. Create your first one.</p>
              <Button className="mt-4" onClick={() => setLocation('/proteus-labs/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Prompt
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {prompts.map((p) => (
                <PromptCard key={p.id} prompt={p} onClick={() => setLocation(`/proteus-labs/${p.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

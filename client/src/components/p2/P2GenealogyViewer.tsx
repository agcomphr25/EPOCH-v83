import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, GitBranch, Search, ShieldCheck } from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface GenealogyOutput {
  id: string;
  work_order_authority_id: string;
  output_identity: string;
  part_number_snapshot: string;
  assembly_path_identity: string;
  output_quantity: string;
  status: string;
  authority_checksum: string;
  custody_status: string | null;
  available_quantity: string | null;
  quality_disposition: string | null;
  release_scope: string | null;
}

interface ComponentEdge {
  id: string;
  child_output_authority_id: string;
  parent_work_order_authority_id: string;
  quantity: string;
  unit_of_measure: string;
  issue_status: string;
  edge_checksum: string;
}

interface GenealogyResult {
  query: string;
  generatedAt: string;
  outputs: GenealogyOutput[];
  componentEdges: ComponentEdge[];
  materialEdges: Array<Record<string, unknown>>;
  summary: { outputs: number; componentEdges: number; materialEdges: number };
}

const download = (name: string, type: string, body: string) => {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function P2GenealogyViewer() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GenealogyResult | null>(null);
  const search = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/p2-genealogy/search?q=${encodeURIComponent(query.trim())}`
      ) as Promise<GenealogyResult>,
    onSuccess: setResult,
  });

  const parentOutputByAuthority = useMemo(
    () =>
      new Map(
        (result?.outputs ?? []).map((output) => [
          output.work_order_authority_id,
          output.id,
        ])
      ),
    [result]
  );

  const exportCsv = () => {
    if (!result) return;
    const rows = [
      [
        'output_identity',
        'part_number',
        'assembly_path',
        'quantity',
        'status',
        'custody',
        'quality',
        'shipment_scope',
        'checksum',
      ],
      ...result.outputs.map((output) => [
        output.output_identity,
        output.part_number_snapshot,
        output.assembly_path_identity,
        output.output_quantity,
        output.status,
        output.custody_status ?? '',
        output.quality_disposition ?? '',
        output.release_scope ?? '',
        output.authority_checksum,
      ]),
    ];
    download(
      `p2-genealogy-${result.query}.csv`,
      'text/csv',
      rows
        .map((row) => row.map((value) => JSON.stringify(value ?? '')).join(','))
        .join('\n')
    );
  };

  return (
    <div className="space-y-4" data-testid="p2-genealogy-viewer">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" /> P2 Genealogy
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Read-only search across manufactured output identity, part, project,
            work-order authority, traveler, and assembly path.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim().length >= 2) search.mutate();
            }}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Serial/batch, part, project, work order, traveler, or assembly path"
              data-testid="p2-genealogy-search"
            />
            <Button disabled={query.trim().length < 2 || search.isPending}>
              <Search className="mr-2 h-4 w-4" />
              {search.isPending ? 'Searching…' : 'Search'}
            </Button>
          </form>
          {search.error && (
            <p className="mt-3 text-sm text-destructive">
              {search.error instanceof Error
                ? search.error.message
                : 'Genealogy search failed.'}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{result.summary.outputs} outputs</Badge>
            <Badge variant="secondary">
              {result.summary.componentEdges} assembly links
            </Badge>
            <Badge variant="secondary">
              {result.summary.materialEdges} material links
            </Badge>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> immutable evidence
            </Badge>
            <Button
              className="ml-auto"
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={!result.outputs.length}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download(
                  `p2-genealogy-${result.query}.json`,
                  'application/json',
                  JSON.stringify(result, null, 2)
                )
              }
              disabled={!result.outputs.length}
            >
              <Download className="mr-2 h-4 w-4" /> Evidence JSON
            </Button>
          </div>

          {!result.outputs.length ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No authoritative P2 genealogy matched “{result.query}”.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {result.outputs.map((output) => {
                const parents = result.componentEdges.filter(
                  (edge) => edge.child_output_authority_id === output.id
                );
                const children = result.componentEdges.filter(
                  (edge) =>
                    parentOutputByAuthority.get(
                      edge.parent_work_order_authority_id
                    ) === output.id
                );
                return (
                  <Card
                    key={output.id}
                    data-testid={`genealogy-output-${output.id}`}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {output.output_identity}
                        </span>
                        <Badge>{output.status}</Badge>
                        {output.custody_status && (
                          <Badge variant="outline">
                            Custody: {output.custody_status}
                          </Badge>
                        )}
                        {output.quality_disposition && (
                          <Badge variant="outline">
                            Quality: {output.quality_disposition}
                          </Badge>
                        )}
                        {output.release_scope && (
                          <Badge variant="outline">Shipment eligible</Badge>
                        )}
                      </div>
                      <p className="text-sm">
                        {output.part_number_snapshot} ·{' '}
                        {output.assembly_path_identity} ·{' '}
                        {output.output_quantity}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono break-all">
                        Authority checksum: {output.authority_checksum}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Parents: {parents.length} · Manufactured children:{' '}
                        {children.length} · Available:{' '}
                        {output.available_quantity ?? 'not received'}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

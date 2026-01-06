import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Trash2, Link2, Archive, Move } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import debounce from 'lodash.debounce';

// ============================================================
// FIELD - Calm Thinking Surface (Unstructured, Opaque)
// Field is intentionally unstructured
// Field does not affect EPOCH data
// No automation or integration is allowed here
// All transitions out of Field are human-initiated
// ============================================================

interface FieldNode {
  id: string;
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
  groupId?: string;
  archived?: boolean;
}

interface FieldConnection {
  id: string;
  fromId: string;
  toId: string;
}

interface FieldGroup {
  id: string;
  name: string;
  color: string;
}

interface FieldData {
  nodes: FieldNode[];
  connections: FieldConnection[];
  groups: FieldGroup[];
}

const GROUP_COLORS = [
  'rgba(59, 130, 246, 0.15)',
  'rgba(16, 185, 129, 0.15)',
  'rgba(245, 158, 11, 0.15)',
  'rgba(239, 68, 68, 0.15)',
  'rgba(139, 92, 246, 0.15)',
];

export default function FieldPage() {
  const [, setLocation] = useLocation();
  const [fieldData, setFieldData] = useState<FieldData>({ nodes: [], connections: [], groups: [] });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dragState, setDragState] = useState<{ nodeId: string; startX: number; startY: number; nodeStartX: number; nodeStartY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const { data: stateData, isLoading } = useQuery<{ fieldData: FieldData; updatedAt: string | null }>({
    queryKey: ['/api/field/state'],
  });

  useEffect(() => {
    if (stateData?.fieldData) {
      const data = stateData.fieldData;
      setFieldData({
        nodes: data.nodes || [],
        connections: data.connections || [],
        groups: data.groups || [],
      });
    }
  }, [stateData]);

  const saveMutation = useMutation({
    mutationFn: async (data: FieldData) => {
      return apiRequest('/api/field/state', {
        method: 'POST',
        body: JSON.stringify({ fieldData: data }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/field/state'] });
    },
  });

  const debouncedSave = useCallback(
    debounce((data: FieldData) => {
      saveMutation.mutate(data);
    }, 1000),
    []
  );

  const updateFieldData = (newData: FieldData) => {
    setFieldData(newData);
    debouncedSave(newData);
  };

  const handlePlace = () => {
    const newNode: FieldNode = {
      id: `node-${Date.now()}`,
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      text: '',
      width: 200,
      height: 80,
    };
    updateFieldData({
      ...fieldData,
      nodes: [...fieldData.nodes, newNode],
    });
    setSelectedNodeIds(new Set([newNode.id]));
  };

  const handleMove = (nodeId: string, x: number, y: number) => {
    updateFieldData({
      ...fieldData,
      nodes: fieldData.nodes.map(n => n.id === nodeId ? { ...n, x, y } : n),
    });
  };

  const handleConnect = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const existingConnection = fieldData.connections.find(
      c => (c.fromId === fromId && c.toId === toId) || (c.fromId === toId && c.toId === fromId)
    );
    if (existingConnection) return;

    const newConnection: FieldConnection = {
      id: `conn-${Date.now()}`,
      fromId,
      toId,
    };
    updateFieldData({
      ...fieldData,
      connections: [...fieldData.connections, newConnection],
    });
  };

  const handleGroup = () => {
    if (selectedNodeIds.size === 0) return;

    const newGroup: FieldGroup = {
      id: `group-${Date.now()}`,
      name: `Group ${fieldData.groups.length + 1}`,
      color: GROUP_COLORS[fieldData.groups.length % GROUP_COLORS.length],
    };

    updateFieldData({
      ...fieldData,
      groups: [...fieldData.groups, newGroup],
      nodes: fieldData.nodes.map(n => selectedNodeIds.has(n.id) ? { ...n, groupId: newGroup.id } : n),
    });
  };

  const handleArchive = () => {
    if (selectedNodeIds.size === 0) return;
    updateFieldData({
      ...fieldData,
      nodes: fieldData.nodes.map(n => selectedNodeIds.has(n.id) ? { ...n, archived: true } : n),
      connections: fieldData.connections.filter(c => !selectedNodeIds.has(c.fromId) && !selectedNodeIds.has(c.toId)),
    });
    setSelectedNodeIds(new Set());
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.min(2, Math.max(0.25, z + delta)));
    }
  }, []);

  const handleTextChange = (nodeId: string, text: string) => {
    updateFieldData({
      ...fieldData,
      nodes: fieldData.nodes.map(n => n.id === nodeId ? { ...n, text } : n),
    });
  };

  const handleDeleteConnection = (connId: string) => {
    updateFieldData({
      ...fieldData,
      connections: fieldData.connections.filter(c => c.id !== connId),
    });
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (connectingFrom) {
      handleConnect(connectingFrom, nodeId);
      setConnectingFrom(null);
      return;
    }
    
    const node = fieldData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    setDragState({
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      nodeStartX: node.x,
      nodeStartY: node.y,
    });
    
    if (e.shiftKey) {
      setSelectedNodeIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return newSet;
      });
    } else {
      setSelectedNodeIds(new Set([nodeId]));
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    handleMove(dragState.nodeId, dragState.nodeStartX + dx, dragState.nodeStartY + dy);
  }, [dragState]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const visibleNodes = fieldData.nodes.filter(n => showArchived || !n.archived);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading Field...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to EPOCH
          </Button>
          <span className="text-sm text-gray-400 dark:text-gray-500 font-light">
            Field — EPOCH
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePlace}
            data-testid="button-place"
          >
            <Plus className="h-4 w-4 mr-1" />
            Place
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGroup}
            disabled={selectedNodeIds.size === 0}
            data-testid="button-group"
          >
            Group{selectedNodeIds.size > 1 ? ` (${selectedNodeIds.size})` : ''}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedNodeIds.size === 2) {
                const ids = Array.from(selectedNodeIds);
                handleConnect(ids[0], ids[1]);
              } else if (selectedNodeIds.size === 1) {
                setConnectingFrom(Array.from(selectedNodeIds)[0]);
              }
            }}
            disabled={selectedNodeIds.size === 0}
            data-testid="button-connect"
          >
            <Link2 className="h-4 w-4 mr-1" />
            Connect{selectedNodeIds.size === 2 ? ' Selected' : ''}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchive}
            disabled={selectedNodeIds.size === 0}
            data-testid="button-archive"
          >
            <Archive className="h-4 w-4 mr-1" />
            Archive{selectedNodeIds.size > 1 ? ` (${selectedNodeIds.size})` : ''}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className={cn(showArchived && 'bg-gray-100 dark:bg-gray-700')}
            data-testid="button-toggle-archived"
          >
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </Button>
        </div>
      </div>

      {connectingFrom && (
        <div className="bg-blue-100 dark:bg-blue-900 px-4 py-2 text-sm text-blue-800 dark:text-blue-200">
          Click another node to connect, or press Escape to cancel
        </div>
      )}

      <div
        ref={canvasRef}
        className="flex-1 relative overflow-auto"
        style={{ cursor: connectingFrom ? 'crosshair' : 'default' }}
        onClick={() => {
          if (!dragState) {
            setSelectedNodeIds(new Set());
            setConnectingFrom(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setConnectingFrom(null);
          }
        }}
        tabIndex={0}
        data-testid="field-canvas"
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            minWidth: '3000px',
            minHeight: '2000px',
            position: 'relative',
          }}
        >
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ minWidth: '3000px', minHeight: '2000px' }}
        >
          {fieldData.connections.map(conn => {
            const fromNode = fieldData.nodes.find(n => n.id === conn.fromId);
            const toNode = fieldData.nodes.find(n => n.id === conn.toId);
            if (!fromNode || !toNode) return null;
            
            const x1 = fromNode.x + fromNode.width / 2;
            const y1 = fromNode.y + fromNode.height / 2;
            const x2 = toNode.x + toNode.width / 2;
            const y2 = toNode.y + toNode.height / 2;

            return (
              <g key={conn.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#9CA3AF"
                  strokeWidth={2}
                  className="pointer-events-auto cursor-pointer hover:stroke-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConnection(conn.id);
                  }}
                />
              </g>
            );
          })}
        </svg>

        {visibleNodes.map(node => {
          const group = node.groupId ? fieldData.groups.find(g => g.id === node.groupId) : null;

          return (
            <div
              key={node.id}
              className={cn(
                'absolute rounded-lg border-2 p-3 shadow-sm transition-shadow',
                selectedNodeIds.has(node.id)
                  ? 'border-blue-500 shadow-lg'
                  : 'border-gray-200 dark:border-gray-600',
                node.archived && 'opacity-50',
                'bg-white dark:bg-gray-800'
              )}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                minHeight: node.height,
                backgroundColor: group?.color || undefined,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, node.id);
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid={`node-${node.id}`}
            >
              {dragState?.nodeId === node.id && (
                <div className="absolute -top-6 left-0 text-xs text-gray-400 flex items-center gap-1">
                  <Move className="h-3 w-3" />
                  Moving
                </div>
              )}
              <textarea
                value={node.text}
                onChange={(e) => handleTextChange(node.id, e.target.value)}
                placeholder="Think here..."
                className="w-full h-full bg-transparent resize-none border-none focus:outline-none text-gray-800 dark:text-gray-200 text-sm"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                data-testid={`input-node-text-${node.id}`}
              />
              {group && (
                <div className="absolute -bottom-5 left-2 text-xs text-gray-500">
                  {group.name}
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-400 flex justify-between">
        <div>
          {saveMutation.isPending ? 'Saving...' : 'Auto-saved'}
          {' · '}
          {visibleNodes.length} nodes
          {showArchived && ` (${fieldData.nodes.filter(n => n.archived).length} archived)`}
          {' · '}
          {fieldData.connections.length} connections
          {selectedNodeIds.size > 0 && ` · ${selectedNodeIds.size} selected`}
        </div>
        <div className="flex items-center gap-2">
          <span>Zoom: {Math.round(zoom * 100)}%</span>
          <span className="text-gray-300">|</span>
          <span>Ctrl+Scroll to zoom · Shift+Click for multi-select</span>
        </div>
      </div>
    </div>
  );
}

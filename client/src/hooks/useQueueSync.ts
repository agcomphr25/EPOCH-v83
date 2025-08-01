// Queue synchronization hook for real-time updates
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface QueueSyncEvent {
  type: 'connected' | 'queue_update' | 'schedule_update';
  data?: any;
  timestamp: string;
}

export function useQueueSync() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Create SSE connection for real-time queue updates
    const eventSource = new EventSource('/api/queue-sync-events');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const syncEvent: QueueSyncEvent = JSON.parse(event.data);
        console.log(`🔄 Queue sync received: ${syncEvent.type}`);

        // Handle different sync event types
        switch (syncEvent.type) {
          case 'connected':
            console.log('📡 Queue sync connected');
            break;
            
          case 'schedule_update':
            // Invalidate schedule and queue caches when schedule updates
            queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
            queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });
            queryClient.invalidateQueries({ queryKey: ['/api/p2-layup-queue'] });
            console.log('📅 Schedule updated, refreshed queue cache');
            break;
            
          case 'queue_update':
            // Invalidate queue caches when orders change status
            queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });
            queryClient.invalidateQueries({ queryKey: ['/api/p2-layup-queue'] });
            
            // If Mesa Universal capacity changed, also refresh schedule
            if (syncEvent.data?.mesaUniversalCount !== undefined) {
              queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
              console.log('🏭 Mesa Universal capacity updated, refreshed all caches');
            } else {
              console.log('📋 Queue updated, refreshed queue cache');
            }
            break;
        }
      } catch (error) {
        console.error('Error parsing queue sync event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Queue sync connection error:', error);
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient]);

  // Manual trigger for queue refresh
  const triggerQueueRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });
    queryClient.invalidateQueries({ queryKey: ['/api/p2-layup-queue'] });
    queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
    console.log('🔄 Manual queue refresh triggered');
  };

  return {
    triggerQueueRefresh
  };
}

// Hook for scheduler components to notify queue of changes
export function useScheduleNotifier() {
  const queryClient = useQueryClient();

  const notifyScheduleUpdate = async (data: any) => {
    try {
      // Send webhook notification to sync queue
      await fetch('/api/queue-sync-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'SCHEDULE_UPDATED',
          data: {
            ...data,
            timestamp: new Date().toISOString()
          }
        })
      });

      // Also invalidate local cache immediately
      queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-layup-queue'] });
      
      console.log('📡 Schedule update notification sent');
    } catch (error) {
      console.error('Failed to notify schedule update:', error);
    }
  };

  return {
    notifyScheduleUpdate
  };
}
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface FeatureOption {
  value: string;
  label: string;
  price?: number;
}

interface SelectionStat {
  featureName: string;
  optionValue: string;
  optionLabel: string;
  selectionCount: number;
  lastSelectedAt: Date;
}

/**
 * Custom hook for AI-powered smart sorting of dropdown options
 * Tracks selection frequency and sorts options intelligently:
 * - Most frequently selected options appear first
 * - Within same frequency, sorts alphabetically
 *
 * @param featureName - The name of the feature (e.g., 'action_inlet')
 * @param options - The available options to sort
 * @returns Sorted options and a tracking function
 */
export function useSmartSort(
  featureName: string,
  options: FeatureOption[] | undefined
) {
  // Fetch selection statistics for this feature
  const { data: selectionStats = [] } = useQuery<SelectionStat[]>({
    queryKey: ['/api/feature-selections/sorted', featureName],
    enabled: !!featureName && !!options && options.length > 0,
  });

  // Sort options intelligently
  const sortedOptions = useMemo(() => {
    if (!options || options.length === 0) return [];

    // Create a map of selection counts for quick lookup
    const selectionMap = new Map<string, number>();
    selectionStats.forEach((stat) => {
      selectionMap.set(stat.optionValue, stat.selectionCount);
    });

    // Sort options: first by selection count (descending), then alphabetically
    return [...options].sort((a, b) => {
      const countA = selectionMap.get(a.value) || 0;
      const countB = selectionMap.get(b.value) || 0;

      // If selection counts are different, sort by count (higher first)
      if (countA !== countB) {
        return countB - countA;
      }

      // If counts are equal, sort alphabetically by label
      return a.label.localeCompare(b.label);
    });
  }, [options, selectionStats]);

  // Function to track a selection
  const trackSelection = useCallback(
    async (optionValue: string, optionLabel: string) => {
      try {
        await apiRequest('/api/feature-selections/track', {
          method: 'POST',
          body: {
            featureName,
            optionValue,
            optionLabel,
          },
        });
      } catch (error) {
        console.error('Failed to track feature selection:', error);
        // Don't throw error - tracking failures shouldn't break the UI
      }
    },
    [featureName]
  );

  return {
    sortedOptions,
    trackSelection,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { Search, X, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SearchResult {
  type: string;
  id: string | number;
  title: string;
  subtitle: string;
  matchedField: string;
  matchedValue: string;
  url: string;
  icon: string;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch search results
  const { data, isLoading } = useQuery<{ results: SearchResult[]; totalCount: number; query: string }>({
    queryKey: ['/api/global-search', { q: debouncedSearch }],
    enabled: debouncedSearch.length >= 2,
  });

  const results = data?.results || [];
  const totalCount = data?.totalCount || 0;

  // Group results by type
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        const selectedResult = results[selectedIndex];
        if (selectedResult) {
          setLocation(selectedResult.url);
          onOpenChange(false);
          setSearchTerm('');
        }
      } else if (e.key === 'Escape') {
        onOpenChange(false);
        setSearchTerm('');
      }
    },
    [results, selectedIndex, setLocation, onOpenChange]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  const handleResultClick = (url: string) => {
    setLocation(url);
    onOpenChange(false);
    setSearchTerm('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] p-0 gap-0" data-testid="dialog-global-search">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-lg font-semibold">
            Global Search
          </DialogTitle>
        </DialogHeader>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search for customers, orders, vendors, employees, inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10 pr-10"
              data-testid="input-global-search"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {searchTerm.length > 0 && searchTerm.length < 2 && (
            <p className="text-sm text-gray-500 mt-2" data-testid="text-min-chars">
              Type at least 2 characters to search
            </p>
          )}
        </div>

        <ScrollArea className="max-h-[500px]" ref={resultsRef}>
          <div className="px-4 pb-4">
            {isLoading && debouncedSearch.length >= 2 && (
              <div className="flex items-center justify-center py-8" data-testid="loader-searching">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Searching...</span>
              </div>
            )}

            {!isLoading && debouncedSearch.length >= 2 && results.length === 0 && (
              <div className="text-center py-8" data-testid="text-no-results">
                <p className="text-sm text-gray-500">
                  No results found for "{debouncedSearch}"
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Try searching for customer names, order IDs, phone numbers, emails, etc.
                </p>
              </div>
            )}

            {!isLoading && results.length > 0 && (
              <div className="space-y-4">
                <div className="text-xs text-gray-500 mb-2" data-testid="text-result-count">
                  Found {totalCount} result{totalCount !== 1 ? 's' : ''}
                </div>

                {Object.entries(groupedResults).map(([type, typeResults]) => (
                  <div key={type} className="space-y-1">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2" data-testid={`heading-${type.toLowerCase().replace(/\s+/g, '-')}`}>
                      {type} ({typeResults.length})
                    </h3>
                    {typeResults.map((result, index) => {
                      const globalIndex = results.indexOf(result);
                      const isSelected = globalIndex === selectedIndex;
                      
                      return (
                        <div
                          key={`${result.type}-${result.id}`}
                          data-index={globalIndex}
                          onClick={() => handleResultClick(result.url)}
                          className={`
                            flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors
                            ${isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'}
                          `}
                          data-testid={`result-${result.type.toLowerCase().replace(/\s+/g, '-')}-${result.id}`}
                        >
                          <div className="text-2xl flex-shrink-0">{result.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate" data-testid={`text-title-${globalIndex}`}>
                              {result.title}
                            </div>
                            <div className="text-xs text-gray-500 truncate mt-0.5" data-testid={`text-subtitle-${globalIndex}`}>
                              {result.subtitle}
                            </div>
                            <div className="text-xs text-blue-600 mt-1" data-testid={`text-matched-${globalIndex}`}>
                              Matched in {result.matchedField}: <span className="font-medium">{result.matchedValue}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">↑↓</kbd> Navigate
              </span>
              <span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Enter</kbd> Select
              </span>
              <span>
                <kbd className="px-2 py-1 bg-white border rounded text-xs">Esc</kbd> Close
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import Papa from "papaparse";

export interface CSVData {
  [key: string]: string | number;
}

export interface CSVContextState {
  data: CSVData[];
  isLoading: boolean;
  error: string | null;
  fileName: string | null;
  rowCount: number;
  rawData: string[][] | null;
}

interface CSVContextType extends CSVContextState {
  parseCSV: (file: File, hasHeaders?: boolean) => void;
  processData: (hasHeaders: boolean) => void;
  clearData: () => void;
}

const CSVContext = createContext<CSVContextType | undefined>(undefined);

export function CSVProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CSVContextState>({
    data: [],
    isLoading: false,
    error: null,
    fileName: null,
    rowCount: 0,
    rawData: null,
  });

  const parseCSV = useCallback((file: File, hasHeaders: boolean = true) => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      fileName: file.name,
    }));

    Papa.parse(file, {
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            const errorMessage = results.errors.map(err => err.message).join(", ");
            setState(prev => ({
              ...prev,
              isLoading: false,
              error: `CSV parsing errors: ${errorMessage}`,
            }));
            return;
          }

          const rawData = results.data as string[][];
          
          if (rawData.length === 0) {
            setState(prev => ({
              ...prev,
              isLoading: false,
              error: "CSV file is empty",
            }));
            return;
          }

          // Store raw data and process it initially
          setState(prev => ({
            ...prev,
            isLoading: false,
            rawData: rawData,
            rowCount: rawData.length - (hasHeaders ? 1 : 0),
          }));

          // Process the data with current header setting
          processDataInternal(rawData, hasHeaders);
        } catch (error) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: `Error processing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }));
        }
      },
      error: (error) => {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: `Failed to parse CSV: ${error.message}`,
        }));
      },
      header: false,
      skipEmptyLines: true,
    });
  }, []);

  const processDataInternal = (rawData: string[][], hasHeaders: boolean) => {
    try {
      let processedData: CSVData[] = [];
      
      if (hasHeaders && rawData.length > 1) {
        const headers = rawData[0];
        processedData = rawData.slice(1).map(row => {
          const obj: CSVData = {};
          headers.forEach((header, index) => {
            if (header) {
              obj[header] = row[index] || '';
            }
          });
          return obj;
        });
      } else {
        processedData = rawData.map(row => {
          const obj: CSVData = {};
          row.forEach((value, index) => {
            obj[`Column ${index + 1}`] = value || '';
          });
          return obj;
        });
      }

      setState(prev => ({
        ...prev,
        data: processedData,
        rowCount: processedData.length,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Error processing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    }
  };

  const processData = useCallback((hasHeaders: boolean) => {
    if (state.rawData) {
      processDataInternal(state.rawData, hasHeaders);
    }
  }, [state.rawData]);

  const clearData = useCallback(() => {
    setState({
      data: [],
      isLoading: false,
      error: null,
      fileName: null,
      rowCount: 0,
      rawData: null,
    });
  }, []);

  return (
    <CSVContext.Provider value={{
      ...state,
      parseCSV,
      processData,
      clearData,
    }}>
      {children}
    </CSVContext.Provider>
  );
}

export function useCSVContext() {
  const context = useContext(CSVContext);
  if (context === undefined) {
    throw new Error('useCSVContext must be used within a CSVProvider');
  }
  return context;
}

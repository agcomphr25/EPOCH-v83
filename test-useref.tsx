import { useRef } from 'react';

export function TestUseRef() {
  console.log('TestUseRef component loading...');
  
  try {
    const testRef = useRef<HTMLDivElement>(null);
    console.log('useRef created successfully:', testRef);
    
    return (
      <div ref={testRef}>
        <h1>useRef Test Success</h1>
        <p>useRef is working correctly</p>
      </div>
    );
  } catch (error) {
    console.error('Error in TestUseRef:', error);
    return (
      <div>
        <h1>Error in useRef Test</h1>
        <p>Error: {error?.toString()}</p>
      </div>
    );
  }
}
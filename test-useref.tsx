import { useRef, useEffect } from 'react';

export function TestUseRef() {
  const testRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    console.log('useRef test:', testRef.current);
  }, []);
  
  return (
    <div ref={testRef}>
      <h1>UseRef Test</h1>
      <p>Check console for useRef output</p>
    </div>
  );
}

export default TestUseRef;
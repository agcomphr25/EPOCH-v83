import { useRef } from 'react';

export function SimpleTest() {
  const testRef = useRef<HTMLDivElement>(null);
  
  return (
    <div ref={testRef}>
      <h1>Simple Test</h1>
      <p>Testing useRef functionality</p>
    </div>
  );
}
import { useRef } from 'react';

export function TestRef() {
  const testRef = useRef<HTMLDivElement>(null);
  
  return (
    <div ref={testRef}>
      <p>Test component with useRef</p>
      <button onClick={() => console.log('Ref current:', testRef.current)}>
        Test Ref
      </button>
    </div>
  );
}
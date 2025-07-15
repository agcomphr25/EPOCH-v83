import { useRef } from 'react';

export default function ReactErrorTest() {
  const testRef = useRef<HTMLDivElement>(null);
  
  return (
    <div ref={testRef}>
      <h1>React Error Test Component</h1>
      <p>If you can see this, React hooks are working properly.</p>
    </div>
  );
}
import { useRef } from "react";

export function MinimalTest() {
  const testRef = useRef<HTMLDivElement>(null);
  
  return (
    <div ref={testRef}>
      <h1>Minimal useRef Test</h1>
      <p>If this renders, useRef is working</p>
    </div>
  );
}
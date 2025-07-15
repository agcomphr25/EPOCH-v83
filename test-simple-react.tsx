import { useState } from 'react';

export function SimpleTest() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <h1>Simple Test: {count}</h1>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}

export default SimpleTest;
import React from "react";

function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>EPOCH v8 - Manufacturing ERP System</h1>
      <p>Application is loading...</p>
      <div style={{ marginTop: '20px' }}>
        <h2>Test React Components</h2>
        <TestComponent />
      </div>
    </div>
  );
}

function TestComponent() {
  const [count, setCount] = React.useState(0);
  
  return (
    <div>
      <p>React Hook Test: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}

export default App;
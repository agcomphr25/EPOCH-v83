// Completely vanilla approach without any imports
function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>EPOCH v8 - Manufacturing ERP System</h1>
      <p>Vanilla React Test - No imports</p>
      <div style={{ marginTop: '20px' }}>
        <VanillaTest />
      </div>
    </div>
  );
}

function VanillaTest() {
  // Try to access React from window object
  const React = (window as any).React;
  
  if (!React) {
    return <div>ERROR: React not found on window object</div>;
  }
  
  const [count, setCount] = React.useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((prev: number) => prev + 1)}>
        Click me
      </button>
    </div>
  );
}

export default App;
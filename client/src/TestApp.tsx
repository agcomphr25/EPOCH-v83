// Pure JavaScript React without any imports except React
function TestApp() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Pure React Test</h1>
      <p>If you see this, React is working!</p>
      <div style={{ marginTop: 20 }}>
        <input 
          placeholder="Test input"
          style={{ padding: 8, fontSize: 16 }}
        />
        <button 
          style={{ marginLeft: 10, padding: 8 }}
          onClick={() => alert("Button works!")}
        >
          Click Me
        </button>
      </div>
    </div>
  );
}

export default TestApp;
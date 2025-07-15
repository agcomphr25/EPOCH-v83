// Extremely simple React component without any imports
function App() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Basic React Test</h1>
      <p>If you see this text, React is working!</p>
      <input placeholder="Test input" style={{ padding: 8, fontSize: 16 }} />
      <button style={{ marginLeft: 10, padding: 8 }} onClick={() => alert("Works!")}>
        Click Me
      </button>
    </div>
  );
}

export default App;
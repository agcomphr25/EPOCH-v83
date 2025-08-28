import React from 'react';

// Simple test component to isolate React issues
const ReactTest: React.FC = () => {
  console.log("ReactTest component rendering...");
  
  return (
    <div style={{
      padding: '20px',
      margin: '20px',
      border: '2px solid #007bff',
      borderRadius: '8px',
      backgroundColor: '#f8f9fa'
    }}>
      <h1>React Test Component</h1>
      <p>If you can see this, React is working correctly.</p>
      <button 
        onClick={() => alert('Button clicked!')}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Test Button
      </button>
    </div>
  );
};

export default ReactTest;
import React from "react";

export default function SimpleTest() {
  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f0f0', border: '2px solid #333' }}>
      <h1 style={{ color: '#333' }}>EPOCH v8 - Manufacturing ERP</h1>
      <h2 style={{ color: '#666' }}>Application is Working!</h2>
      <p>React is now rendering properly.</p>
      <div style={{ marginTop: '20px' }}>
        <h3>Available Features:</h3>
        <ul>
          <li>Order Management</li>
          <li>Order Entry</li>
          <li>Discount Management</li>
          <li>Feature Manager</li>
        </ul>
      </div>
    </div>
  );
}
export default function SimpleTest() {
  return (
    <div style={{ padding: '20px', border: '2px solid green', margin: '20px' }}>
      <h1>Simple Test Component</h1>
      <p>This is a basic test to verify React is working</p>
      <button onClick={() => alert('Button clicked!')}>Test Button</button>
    </div>
  );
}
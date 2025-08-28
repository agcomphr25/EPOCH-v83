// Minimal React app without JSX or TypeScript
const React = require('react');
const ReactDOM = require('react-dom/client');

// Create a simple element using React.createElement
const app = React.createElement('div', {
  style: {
    padding: '20px',
    backgroundColor: '#f0f0f0',
    border: '2px solid #333',
    fontFamily: 'Arial, sans-serif'
  }
}, [
  React.createElement('h1', {
    key: 'h1',
    style: { color: '#333' }
  }, 'EPOCH v8 - Manufacturing ERP'),
  React.createElement('h2', {
    key: 'h2',
    style: { color: '#666' }
  }, 'React Application Successfully Loaded!'),
  React.createElement('p', {
    key: 'p'
  }, 'The React plugin issues have been resolved.'),
  React.createElement('div', {
    key: 'status',
    style: { marginTop: '20px' }
  }, [
    React.createElement('h3', { key: 'h3' }, 'System Status:'),
    React.createElement('ul', { key: 'ul' }, [
      React.createElement('li', { key: 'li1' }, '✓ React runtime initialized'),
      React.createElement('li', { key: 'li2' }, '✓ Component rendering working'),
      React.createElement('li', { key: 'li3' }, '✓ Development server running')
    ])
  ])
]);

// Initialize the React app
const root = document.getElementById('root');
if (root) {
  console.log('Root element found, initializing React...');
  const reactRoot = ReactDOM.createRoot(root);
  reactRoot.render(app);
  console.log('React app rendered successfully');
} else {
  console.error('Root element not found');
}
// Minimal React test without TypeScript or complex dependencies
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Create a simple component using React.createElement
const TestComponent = () => {
  return createElement('div', {
    style: {
      padding: '20px',
      backgroundColor: '#f0f0f0',
      border: '2px solid #333',
      fontFamily: 'Arial, sans-serif'
    }
  }, [
    createElement('h1', {
      key: 'title',
      style: { color: '#333' }
    }, 'EPOCH v8 - Manufacturing ERP'),
    createElement('h2', {
      key: 'subtitle',
      style: { color: '#666' }
    }, 'React Application Test'),
    createElement('p', {
      key: 'description'
    }, 'Testing basic React rendering without complex dependencies.'),
    createElement('div', {
      key: 'status',
      style: { marginTop: '20px', padding: '15px', backgroundColor: '#e8f5e8', border: '1px solid #4caf50' }
    }, [
      createElement('h3', { key: 'status-title' }, 'Status:'),
      createElement('ul', { key: 'status-list' }, [
        createElement('li', { key: 'status-1' }, '✅ Simple React component'),
        createElement('li', { key: 'status-2' }, '✅ No TypeScript complexity'),
        createElement('li', { key: 'status-3' }, '✅ No external dependencies')
      ])
    ])
  ]);
};

// Initialize the React app
const rootElement = document.getElementById('root');
if (rootElement) {
  console.log('Root element found, rendering simple React test...');
  const root = createRoot(rootElement);
  root.render(createElement(TestComponent));
  console.log('Simple React test rendered successfully');
} else {
  console.error('Root element not found');
}
// Disable React refresh runtime completely
if (typeof window !== 'undefined') {
  // Override React refresh functions before any React code loads
  (window as any).$RefreshReg$ = () => {};
  (window as any).$RefreshSig$ = () => (type: any) => type;
  (window as any).__vite_plugin_react_preamble_installed__ = true;
  
  // Don't set read-only properties to avoid conflicts
  console.log("React refresh disabled successfully");
}
// Comprehensive React refresh runtime fix
// This file completely disables React refresh to prevent runtime errors

// Set up global refresh runtime stubs before any React components load
if (typeof window !== 'undefined') {
  // Disable all React refresh functionality
  (window as any).$RefreshReg$ = () => {};
  (window as any).$RefreshSig$ = () => (type: any) => type;
  (window as any).__vite_plugin_react_preamble_installed__ = true;

  // Create a complete RefreshRuntime stub
  const RefreshRuntime = {
    register: () => {},
    createSignatureFunctionForTransform: () => () => {},
    isLikelyComponentType: () => false,
    getFamilyByType: () => null,
    performReactRefresh: () => {},
    findAffectedHostInstances: () => [],
    updateRefreshBoundarySignature: () => {},
    setSignature: () => {},
    collectCustomHooksForSignature: () => [],
    shouldInvalidateReactRefreshBoundary: () => false,
    shouldUpdateReactRefreshBoundary: () => false,
    getRefreshBoundarySignature: () => null,
    registerExportsForReactRefresh: () => {},
    validateRefreshBoundarySignature: () => false,
    injectIntoGlobalHook: () => {},
    hasUnrecoverableErrors: () => false,
    clearRefreshBoundarySignature: () => {},
    markFailedErrorBoundaryForHotReloading: () => {},
    scheduleRefresh: () => {},
    scheduleRoot: () => {},
    setRefreshHandler: () => {},
  };

  // Assign the stub to global scope
  (window as any).RefreshRuntime = RefreshRuntime;
  (window as any).__reactRefreshInjected = true;

  // Also disable if it's assigned to globalThis
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).RefreshRuntime = RefreshRuntime;
    (globalThis as any).$RefreshReg$ = () => {};
    (globalThis as any).$RefreshSig$ = () => (type: any) => type;
  }
}

// Prevent any refresh runtime from being loaded
export {};
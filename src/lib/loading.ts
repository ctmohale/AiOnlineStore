const pendingRequests = new Set<symbol>();
const listeners = new Set<() => void>();
export const getPendingRequests = () => pendingRequests.size;
export const subscribeToLoading = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const beginLoading = () => {
  const request = Symbol('loading-request');
  pendingRequests.add(request);
  listeners.forEach((listener) => listener());
  return () => {
    if (!pendingRequests.delete(request)) return;
    listeners.forEach((listener) => listener());
  };
};

export const resetLoading = () => {
  if (pendingRequests.size === 0) return;
  pendingRequests.clear();
  listeners.forEach((listener) => listener());
};

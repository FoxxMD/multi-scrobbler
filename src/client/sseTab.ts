// per-page-load id sent with the shared /api/events connection so the server can opt this tab in/out of log events
// not crypto.randomUUID because it is undefined on insecure (plain http LAN) origins
export const sseTabId = Math.random().toString(36).slice(2);

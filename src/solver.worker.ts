import { settle } from "./settle";
self.onmessage = (event: MessageEvent) => {
  try {
    const { rows, mode, hubId, request } = event.data;
    self.postMessage({ request, solution: settle(rows, mode, hubId) });
  } catch (e) {
    self.postMessage({ request: event.data.request, error: String(e) });
  }
};

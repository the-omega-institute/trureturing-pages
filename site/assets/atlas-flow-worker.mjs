import { flowLayout } from "./atlas-flow-layout.mjs";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ positions: flowLayout(data.theory, data.architecture) });
  } catch (error) { self.postMessage({ error: error.message }); }
};

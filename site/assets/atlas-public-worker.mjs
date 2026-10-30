import { createPublicModel, computeLayout } from "./atlas-public-core.mjs?v=lean-admission-v2";
self.onmessage = ({ data }) => {
  try {
    const positions = computeLayout(createPublicModel(data), (value) =>
      self.postMessage({ progress: value }),
    );
    self.postMessage({ positions });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

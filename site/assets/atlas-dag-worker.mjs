import { createPublicModel } from './atlas-public-core.mjs';
import { analyzeArchitecture } from './architecture-core.mjs';
import { theoryModel, theoryLayout } from './atlas-theory-core.mjs';
self.onmessage = ({data}) => {
  try {
    const model = createPublicModel(data), architecture = analyzeArchitecture(data);
    self.postMessage({positions: theoryLayout(theoryModel(model, architecture), architecture)});
  } catch (error) { self.postMessage({error: error.message}); }
};

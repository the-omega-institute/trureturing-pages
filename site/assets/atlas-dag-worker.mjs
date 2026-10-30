import { createPublicModel } from './atlas-public-core.mjs?v=lean-admission-v1';
import { analyzeArchitecture, mathematicalArchitecture } from './architecture-core.mjs?v=lean-admission-v1';
import { theoryModel, theoryLayout } from './atlas-theory-core.mjs?v=lean-admission-v1';
self.onmessage = ({data}) => {
  try {
    analyzeArchitecture(data);
    const model = createPublicModel(data), architecture = mathematicalArchitecture(model);
    self.postMessage({positions: theoryLayout(theoryModel(model, architecture), architecture)});
  } catch (error) { self.postMessage({error: error.message}); }
};

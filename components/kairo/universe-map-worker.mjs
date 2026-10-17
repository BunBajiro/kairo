import {createTerritoryGeometry} from './universe-map-math.mjs';

/**
 * One-shot territory preparation for UniverseMap: receive {points} in normalized
 * world units and post {geometry} or a serializable {error}. The component owns
 * worker termination, superseded-result fencing and synchronous fallback. No
 * pilot data or live overlays are needed; interactions reuse the static geometry.
 */
self.onmessage = ({data}) => {
  try {self.postMessage({geometry: createTerritoryGeometry(data.points)});}
  catch (error) {self.postMessage({error: String(error)});}
};

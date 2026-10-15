import {createTerritoryGeometry} from './universe-map-math.mjs';

// Geometry changes only with the static projection; all normal map interaction reuses it.
self.onmessage = ({data}) => {
  try {self.postMessage({geometry: createTerritoryGeometry(data.points)});}
  catch (error) {self.postMessage({error: String(error)});}
};

import * as THREE from "https://cdn.skypack.dev/three@0.137";

function hexGeometry(height, position) {
  let geo = new THREE.CylinderGeometry(1, 1, height, 6, 1, false);
  geo.translate(position.x, height * 0.5, position.y);
  return geo;
}

export { hexGeometry };

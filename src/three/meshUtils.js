import * as THREE_MODULE from "https://cdn.skypack.dev/three@0.137"; // Renamed to avoid conflict if THREE is passed as arg
import { mergeBufferGeometries as mergeGeometries } from "https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils"; // Renamed for clarity
import { MAX_HEIGHT } from "../game/constants.js";

function hexMesh(geo, map, envmap, THREE) { // THREE is passed here
  if (map && typeof map.mapping === "undefined") {
    console.warn(
      "hexMesh received an invalid map object that is not a Texture:",
      map
    );
  }
  let mat = new THREE.MeshPhysicalMaterial({
    envMap: envmap,
    envMapIntensity: 0.135,
    flatShading: true,
    map: map instanceof THREE.Texture ? map : undefined,
  });
  let mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createCloudsMesh(envmap, THREE, mergeBufferGeometries) { // Explicitly pass THREE and mergeBufferGeometries
  let geo = new THREE.SphereGeometry(0, 0, 0); // Use the passed THREE
  let count = Math.floor(Math.pow(Math.random(), 0.45) * 4);
  for (let i = 0; i < count; i++) {
    const puff1 = new THREE.SphereGeometry(1.2, 7, 7);
    const puff2 = new THREE.SphereGeometry(1.5, 7, 7);
    const puff3 = new THREE.SphereGeometry(0.9, 7, 7);
    puff1.translate(-1.85, Math.random() * 0.3, 0);
    puff2.translate(0, Math.random() * 0.3, 0);
    puff3.translate(1.85, Math.random() * 0.3, 0);
    const cloudGeo = mergeBufferGeometries([puff1, puff2, puff3]); // Use passed mergeBufferGeometries
    cloudGeo.translate(
      Math.random() * 20 - 10,
      Math.random() * 7 + 7,
      Math.random() * 20 - 10
    );
    cloudGeo.rotateY(Math.random() * Math.PI * 2);
    geo = mergeBufferGeometries([geo, cloudGeo]);
  }
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      envMap: envmap,
      envMapIntensity: 0.75,
      flatShading: true,
    })
  );
  return mesh;
}

function createSeaMesh(textures, envmap, MAX_HEIGHT_PARAM, THREE) { // MAX_HEIGHT_PARAM to distinguish from imported MAX_HEIGHT
  let seaTexture = textures.water;
  seaTexture.repeat = new THREE.Vector2(1, 1);
  seaTexture.wrapS = THREE.RepeatWrapping;
  seaTexture.wrapT = THREE.RepeatWrapping;

  let seaMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(17, 17, MAX_HEIGHT_PARAM * 0.2, 50), // Use passed MAX_HEIGHT_PARAM
    new THREE.MeshPhysicalMaterial({
      envMap: envmap,
      color: new THREE.Color("#55aaff")
        .convertSRGBToLinear()
        .multiplyScalar(3),
      ior: 1.4,
      transmission: 1,
      transparent: true,
      thickness: 1.5,
      envMapIntensity: 0.2,
      roughness: 1,
      metalness: 0.025,
      roughnessMap: seaTexture,
      metalnessMap: seaTexture,
    })
  );
  seaMesh.receiveShadow = true;
  seaMesh.rotation.y = -Math.PI * 0.333 * 0.5;
  seaMesh.position.set(0, MAX_HEIGHT_PARAM * 0.1, 0); // Use passed MAX_HEIGHT_PARAM
  return seaMesh;
}

function createMapContainerMesh(textures, envmap, MAX_HEIGHT_PARAM, THREE) {
  let mapContainer = new THREE.Mesh(
    new THREE.CylinderGeometry(
      17.1,
      17.1,
      MAX_HEIGHT_PARAM * 0.25, // Use passed MAX_HEIGHT_PARAM
      50,
      1,
      true
    ),
    new THREE.MeshPhysicalMaterial({
      envMap: envmap,
      map: textures.dirt,
      envMapIntensity: 0.2,
      side: THREE.DoubleSide,
    })
  );
  mapContainer.receiveShadow = true;
  mapContainer.rotation.y = -Math.PI * 0.333 * 0.5;
  mapContainer.position.set(0, MAX_HEIGHT_PARAM * 0.125, 0); // Use passed MAX_HEIGHT_PARAM
  return mapContainer;
}

function createMapFloorMesh(textures, envmap, MAX_HEIGHT_PARAM, THREE) {
  let mapFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(18.5, 18.5, MAX_HEIGHT_PARAM * 0.1, 50), // Use passed MAX_HEIGHT_PARAM
    new THREE.MeshPhysicalMaterial({
      envMap: envmap,
      map: textures.dirt2,
      envMapIntensity: 0.1,
      side: THREE.DoubleSide,
    })
  );
  mapFloor.receiveShadow = true;
  mapFloor.position.set(0, -MAX_HEIGHT_PARAM * 0.05, 0); // Use passed MAX_HEIGHT_PARAM
  return mapFloor;
}

export {
  hexMesh,
  createCloudsMesh,
  createSeaMesh,
  createMapContainerMesh,
  createMapFloorMesh
};

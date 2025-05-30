import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createNoise2D } from 'simplex-noise';
import { mergeBufferGeometries } from 'three-stdlib/utils/BufferGeometryUtils';
import {
  MAX_HEIGHT,
  TILE_X_RANGE,
  TILE_Y_RANGE,
  STONE_HEIGHT_THRESHOLD,
  DIRT_HEIGHT_THRESHOLD,
  GRASS_HEIGHT_THRESHOLD,
  SAND_HEIGHT_THRESHOLD,
  DIRT2_HEIGHT_THRESHOLD,
  SURFACE_HEIGHT,
  HexData,
  HexDataMap, // Make sure HexDataMap is exported from globals.ts
  dummy, // Exported from globals.ts
  defaultMaterial // Exported from globals.ts
} from './globals';

export function tileToPosition(tileX: number, tileY: number): THREE.Vector2 {
  return new THREE.Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
}

export function hexGeometry(height: number, position: THREE.Vector2): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, height, 6, 1, false);
  geo.translate(position.x, height * 0.5, position.y); // As per original
  return geo;
}

export function hexMeshMaterial(map: THREE.Texture, envmap: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    envMap: envmap,
    envMapIntensity: 0.135,
    flatShading: true,
    map: map,
  });
}

export function treeGeometry(height: number, position: THREE.Vector2): THREE.BufferGeometry {
  const treeHeight = Math.random() * 1 + 1.25;
  const geo1 = new THREE.CylinderGeometry(0, 1.5, treeHeight, 3);
  geo1.translate(position.x, height + treeHeight * 0 + 1, position.y);
  const geo2 = new THREE.CylinderGeometry(0, 1.15, treeHeight, 3);
  geo2.translate(position.x, height + treeHeight * 0.6 + 1, position.y);
  const geo3 = new THREE.CylinderGeometry(0, 0.8, treeHeight, 3);
  geo3.translate(position.x, height + treeHeight * 1.25 + 1, position.y);
  return mergeBufferGeometries([geo1, geo2, geo3]) as THREE.BufferGeometry;
}

export function stoneGeometry(height: number, position: THREE.Vector2): THREE.SphereGeometry {
  const px = Math.random() * 0.4;
  const pz = Math.random() * 0.4;
  const geo = new THREE.SphereGeometry(Math.random() * 0.3 + 0.1, 7, 7);
  geo.translate(position.x + px, height, position.y + pz);
  return geo;
}

export function generateHexagonGrid(
  loadedTextures: { [key: string]: THREE.Texture },
  currentEnvmap: THREE.Texture,
  scene: THREE.Scene,
  world: CANNON.World,
  hexDataMapRef: HexDataMap,
  instancedMeshesRef: { [key: string]: THREE.InstancedMesh },
  allHexMeshesRef: THREE.InstancedMesh[]
): void {
  console.log('generateHexagonGrid called - actual implementation pending.');

  const noise2D = createNoise2D(Math.random); // Using Math.random as the seed generator function
  const allHexInfo: Array<{ i: number; j: number; position: THREE.Vector2; height: number }> = [];
  const heightfieldMatrix: number[][] = [];
  let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;

  // First pass: collect all positions and heights for the actual hex grid
  for (let i = -TILE_X_RANGE; i <= TILE_X_RANGE; i++) {
    for (let j = -TILE_Y_RANGE; j <= TILE_Y_RANGE; j++) {
      const position = tileToPosition(i, j);
      if (position.length() > 50) continue; // Original condition
      minI = Math.min(minI, i);
      maxI = Math.max(maxI, i);
      minJ = Math.min(minJ, j);
      maxJ = Math.max(maxJ, j);
      let noiseVal = (noise2D(i * 0.1, j * 0.1) + 1) * 0.5; // noise2D returns values between -1 and 1
      noiseVal = Math.pow(noiseVal, 1.5);
      const currentHeight = noiseVal * MAX_HEIGHT;
      allHexInfo.push({ i, j, position, height: currentHeight });
    }
  }
  
  if (allHexInfo.length === 0) {
    console.warn("No hex info generated, skipping map generation.");
    return;
  }

  // Determine matrix dimensions WITH PADDING
  const paddedMinI = minI - 1;
  const paddedMaxI = maxI + 1;
  const paddedMinJ = minJ - 1;
  const paddedMaxJ = maxJ + 1;

  const numRows = paddedMaxJ - paddedMinJ + 1;
  const numCols = paddedMaxI - paddedMinI + 1;
  const veryLowHeight = -MAX_HEIGHT * 2;

  for (let r = 0; r < numRows; r++) {
    heightfieldMatrix[r] = new Array(numCols).fill(veryLowHeight);
  }

  const groupedInstanceData: { [type: string]: Array<{ matrix: THREE.Matrix4; tileX: number; tileY: number; worldPos: THREE.Vector2; baseHeight: number; perGroupInstanceId: number;}>} = {
    stone: [], dirt: [], grass: [], sand: [], dirt2: []
  };

  for (const hexInfo of allHexInfo) {
    const r = hexInfo.j - paddedMinJ;
    const c = hexInfo.i - paddedMinI;
    let isGrass = false;
    const tempHeight = hexInfo.height;
    if (tempHeight > GRASS_HEIGHT_THRESHOLD && tempHeight <= DIRT_HEIGHT_THRESHOLD) {
        isGrass = true;
    }
    if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
        heightfieldMatrix[r][c] = isGrass ? 0 : hexInfo.height;
    }
    
    let currentHeight = hexInfo.height;
    const currentPosition = hexInfo.position;
    const tileX = hexInfo.i;
    const tileY = hexInfo.j;
    let materialType: string | null = null;

    if (currentHeight > STONE_HEIGHT_THRESHOLD) materialType = "stone";
    else if (currentHeight > DIRT_HEIGHT_THRESHOLD) materialType = "dirt";
    else if (currentHeight > GRASS_HEIGHT_THRESHOLD) materialType = "grass";
    else if (currentHeight > SAND_HEIGHT_THRESHOLD) materialType = "sand";
    else if (currentHeight > DIRT2_HEIGHT_THRESHOLD) materialType = "dirt2";
    else continue;

    if (materialType === "grass" || materialType === "dirt" || materialType === "dirt2") {
      currentHeight = SURFACE_HEIGHT;
    } else if (materialType === "sand") {
      currentHeight = SURFACE_HEIGHT - 0.2;
    } else if (materialType === "stone") {
      currentHeight = SURFACE_HEIGHT + 3;
    }
    // 'water' type was not in original instancing logic, handled by seaMesh

    dummy.position.set(currentPosition.x, currentHeight * 0.5, currentPosition.y);
    const baseGeometryHeight = 1; // Assuming CylinderGeometry base height is 1 for scaling
    dummy.scale.set(1, currentHeight / baseGeometryHeight, 1);
    dummy.updateMatrix();

    if (groupedInstanceData[materialType]) {
      const perGroupInstanceId = groupedInstanceData[materialType].length;
      groupedInstanceData[materialType].push({
        matrix: dummy.matrix.clone(),
        tileX: tileX, tileY: tileY,
        worldPos: currentPosition.clone(), // Ensure clone for safety
        baseHeight: currentHeight,
        perGroupInstanceId: perGroupInstanceId
      });

      const mapKey = `${tileX},${tileY}`;
      hexDataMapRef.set(mapKey, {
        tileX: tileX, tileY: tileY,
        worldPos: currentPosition.clone(),
        baseHeight: currentHeight,
        materialType: materialType,
        perGroupInstanceId: perGroupInstanceId
      });
    }
  }

  // Create Heightfield
  if (heightfieldMatrix.length > 0 && heightfieldMatrix[0].length > 0 && numCols > 0 && numRows > 0) {
    const elementSizeForHeightfield = 0.5; // From original code
    const heightfieldShape = new CANNON.Heightfield(heightfieldMatrix, { elementSize: elementSizeForHeightfield });
    const hfBody = new CANNON.Body({ mass: 0, material: defaultMaterial }); // Use global defaultMaterial
    const quaternion = new CANNON.Quaternion();
    quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    hfBody.addShape(heightfieldShape, new CANNON.Vec3(), quaternion);

    const paddedMinCornerWorldPos = tileToPosition(paddedMinI, paddedMinJ);
    const totalWidth = (numCols - 1) * elementSizeForHeightfield;
    const totalDepth = (numRows - 1) * elementSizeForHeightfield;
    hfBody.position.set(
      paddedMinCornerWorldPos.x + totalWidth * 0.5,
      0, // Assuming heightfield is at Y=0 and hex heights are relative
      paddedMinCornerWorldPos.y + totalDepth * 0.5
    );
    world.addBody(hfBody);
  }

  // Create InstancedMeshes
  const baseHexGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false); // Unit height = 1

  for (const type in groupedInstanceData) {
    const instances = groupedInstanceData[type];
    if (instances.length > 0 && loadedTextures[type]) {
      const material = hexMeshMaterial(loadedTextures[type], currentEnvmap);
      const instancedHexMesh = new THREE.InstancedMesh(baseHexGeo, material, instances.length);
      instancedHexMesh.castShadow = true;
      instancedHexMesh.receiveShadow = true;
      instancedHexMesh.userData.materialType = type;
      instancedMeshesRef[type] = instancedHexMesh;

      for (let i = 0; i < instances.length; i++) {
        instancedHexMesh.setMatrixAt(i, instances[i].matrix);
      }
      instancedHexMesh.instanceMatrix.needsUpdate = true;
      scene.add(instancedHexMesh);
      allHexMeshesRef.push(instancedHexMesh);
    }
  }
}

export function createSeaMesh(
  loadedTextures: { [key: string]: THREE.Texture },
  currentEnvmap: THREE.Texture,
  scene: THREE.Scene
): THREE.Mesh {
  const seaTexture = loadedTextures.water; // Assuming 'water' texture is loaded
  if (!seaTexture) {
    console.error("Water texture not found for sea mesh!");
    // Return a placeholder or throw error
    return new THREE.Mesh(); // Placeholder
  }
  seaTexture.repeat = new THREE.Vector2(1, 1);
  seaTexture.wrapS = THREE.RepeatWrapping;
  seaTexture.wrapT = THREE.RepeatWrapping;

  const seaMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(34, 34, MAX_HEIGHT * 0.2, 50),
    new THREE.MeshPhysicalMaterial({
      envMap: currentEnvmap,
      color: new THREE.Color("#55aaff").convertSRGBToLinear().multiplyScalar(3),
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
  seaMesh.position.set(0, MAX_HEIGHT * 0.1, 0);
  scene.add(seaMesh);
  return seaMesh;
}

export function createMapContainer(
  loadedTextures: { [key: string]: THREE.Texture },
  currentEnvmap: THREE.Texture,
  scene: THREE.Scene
): THREE.Mesh {
  const dirtTexture = loadedTextures.dirt; // Assuming 'dirt' texture
  if (!dirtTexture) {
    console.error("Dirt texture not found for map container!");
    return new THREE.Mesh();
  }
  const mapContainer = new THREE.Mesh(
    new THREE.CylinderGeometry(34.1, 34.1, MAX_HEIGHT * 0.25, 50, 1, true),
    new THREE.MeshPhysicalMaterial({
      envMap: currentEnvmap,
      map: dirtTexture,
      envMapIntensity: 0.2,
      side: THREE.DoubleSide,
    })
  );
  mapContainer.receiveShadow = true;
  mapContainer.rotation.y = -Math.PI * 0.333 * 0.5;
  mapContainer.position.set(0, MAX_HEIGHT * 0.125, 0);
  scene.add(mapContainer);
  return mapContainer;
}

export function createMapFloor(
  loadedTextures: { [key: string]: THREE.Texture },
  currentEnvmap: THREE.Texture,
  scene: THREE.Scene
): THREE.Mesh {
  const dirt2Texture = loadedTextures.dirt2; // Assuming 'dirt2' texture
  if (!dirt2Texture) {
    console.error("Dirt2 texture not found for map floor!");
    return new THREE.Mesh();
  }
  const mapFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(37, 37, MAX_HEIGHT * 0.1, 50),
    new THREE.MeshPhysicalMaterial({
      envMap: currentEnvmap,
      map: dirt2Texture,
      envMapIntensity: 0.1,
      side: THREE.DoubleSide,
    })
  );
  mapFloor.receiveShadow = true;
  mapFloor.position.set(0, -MAX_HEIGHT * 0.05, 0);
  scene.add(mapFloor);
  return mapFloor;
}

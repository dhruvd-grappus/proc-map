/// <reference path="./types.d.ts" />

import {
  WebGLRenderer, ACESFilmicToneMapping, sRGBEncoding,
  Color, CylinderGeometry,
  RepeatWrapping, DoubleSide, BoxGeometry, Mesh, PointLight, MeshPhysicalMaterial, PerspectiveCamera,
  Scene, PMREMGenerator, PCFSoftShadowMap,
  Vector2, TextureLoader, SphereGeometry, MeshStandardMaterial, Raycaster, Vector3, Object3D,
  BufferGeometry, Matrix4, InstancedMesh, Texture, Material, NormalMapTypes, TangentSpaceNormalMap,
} from 'https://cdn.skypack.dev/three@0.137';
// Using * as THREE for explicit namespacing where types might be ambiguous or for consistency
import * as THREE from 'https://cdn.skypack.dev/three@0.137';
import { OrbitControls } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls';
import { RGBELoader } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader';
import { mergeBufferGeometries } from 'https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils';
import SimplexNoise from 'https://cdn.skypack.dev/simplex-noise@3.0.0';
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';

const scene: THREE.Scene = new Scene();
scene.background = new Color("#FFEECC");

const world: CANNON.World = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²
});
world.allowSleep = true; // Allow bodies to sleep
world.solver.iterations = 20; // Set iterations on the default solver
world.solver.tolerance = 0.01; // Decrease solver tolerance for stricter contacts

const defaultMaterial: CANNON.Material = new CANNON.Material("default");
const defaultContactMaterial: CANNON.ContactMaterial = new CANNON.ContactMaterial(
  defaultMaterial,
  defaultMaterial,
  {
    friction: 0.7,
    restitution: 0.05,
    contactEquationStiffness: 1e10,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e10,
    frictionEquationRelaxation: 3
  }
);
world.defaultContactMaterial = defaultContactMaterial;

const camera: THREE.PerspectiveCamera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-25.5, 46.5, 49.5);

const renderer: THREE.WebGLRenderer = new WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputEncoding = sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
document.querySelector<HTMLDivElement>("#app")!.appendChild(renderer.domElement);

const light: THREE.PointLight = new PointLight( new Color("#FFCB8E").convertSRGBToLinear().convertSRGBToLinear(), 80, 200 );
light.position.set(10, 20, 10);

light.castShadow = true;
light.shadow.mapSize.width = 512;
light.shadow.mapSize.height = 512;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 500;
scene.add( light );

const controls: OrbitControls = new OrbitControls(camera, renderer.domElement);
controls.target.set(20,0,20);
controls.dampingFactor = 0.05;
controls.enableDamping = true;

let pmrem: THREE.PMREMGenerator = new PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

const timeStep: number = 1 / 60; // seconds
let lastCallTime: number | undefined;

let envmap: THREE.Texture;

const groundBody: CANNON.Body = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const MAX_HEIGHT: number = 10;

// const physicalBodies: CANNON.Body[] = []; // Unused, can be removed
// const visualMeshes: THREE.Mesh[] = []; // Unused, can be removed

const allHexMeshes: THREE.InstancedMesh[] = [];
const hexDataMap: Map<string, HexData> = new Map();

// const TILE_X_RANGE: number = 100; // Unused
// const TILE_Y_RANGE: number = 100; // Unused

interface RawHexInfo {
    i: number;
    j: number;
    position: THREE.Vector2;
    height: number;
    materialType: string;
}
const allHexInfo: RawHexInfo[] = [];

const groupedInstanceData: GroupedInstanceData = {
  stone: [],
  dirt: [],
  grass: [],
  sand: [],
  dirt2: []
};
const instancedMeshes: { [type: string]: THREE.InstancedMesh } = {};

const dummy: THREE.Object3D = new Object3D();

(async function() {
  const surfaceHeight: number = 3;

  let envmapTexture: THREE.DataTexture = await new RGBELoader().loadAsync("assets/envmap.hdr");
  let rt: THREE.WebGLRenderTarget = pmrem.fromEquirectangular(envmapTexture);
  envmap = rt.texture;

  let textures: Textures = {
    dirt: await new TextureLoader().loadAsync("assets/dirt.png"),
    dirt2: await new TextureLoader().loadAsync("assets/dirt2.jpg"),
    grass: [
      await new TextureLoader().loadAsync("assets/grass1-albedo3.png"),
      await new TextureLoader().loadAsync("assets/grass.jpg")
    ],
    grassNormal: await new TextureLoader().loadAsync("assets/grass1-normal1-dx.png"),
    sand: await new TextureLoader().loadAsync("assets/sand.jpg"),
    water: await new TextureLoader().loadAsync("assets/water.jpg"),
    stone: await new TextureLoader().loadAsync("assets/stone.png"),
  };

  const mapDataResponse: Response = await fetch("assets/gettysburg_map_data.json");
  const loadedMapData: LoadedMapData = await mapDataResponse.json();

  const heightfieldMatrix: number[][] = [];
  let minI: number = Infinity, maxI: number = -Infinity, minJ: number = Infinity, maxJ: number = -Infinity;

  allHexInfo.length = 0;

  if (loadedMapData && loadedMapData.hex_data) {
    for (const tile of loadedMapData.hex_data) {
      const coords: string[] = tile.coord.split(',');
      const tileX: number = parseInt(coords[0], 10);
      const tileY: number = parseInt(coords[1], 10);
      const position: THREE.Vector2 = tileToPosition(tileX, tileY);

      let materialType: string = tile.terrain;
      if (!groupedInstanceData[materialType]) {
        console.warn(`Material type "${materialType}" not pre-defined in groupedInstanceData. Defaulting to 'grass'. Add texture and entry if needed.`);
        if (!textures[materialType]) {
            console.warn(`Texture for "${materialType}" is missing. Rendering will likely fail for this type.`);
        }
        groupedInstanceData[materialType] = [];
      }

      allHexInfo.push({
        i: tileX,
        j: tileY,
        position: position,
        height: tile.elevation,
        materialType: materialType
      });
      minI = Math.min(minI, tileX);
      maxI = Math.max(maxI, tileX);
      minJ = Math.min(minJ, tileY);
      maxJ = Math.max(maxJ, tileY);
    }
  } else {
    console.error("Failed to load hex_data from gettysburg_map_data.json or it's missing.");
  }

  if (allHexInfo.length === 0) {
    console.warn("Map data is empty or failed to load. Creating a default tile.");
    const defaultTile: RawHexInfo = { i: 0, j: 0, position: tileToPosition(0,0), height: surfaceHeight, materialType: "grass" };
    allHexInfo.push(defaultTile);
    minI = 0; maxI = 0; minJ = 0; maxJ = 0;
  }

  const paddedMinI: number = minI - 1;
  const paddedMaxI: number = maxI + 1;
  const paddedMinJ: number = minJ - 1;
  const paddedMaxJ: number = maxJ + 1;

  const numRows: number = paddedMaxJ - paddedMinJ + 1;
  const numCols: number = paddedMaxI - paddedMinI + 1;
  const veryLowHeight: number = -MAX_HEIGHT * 2;

  for (let r: number = 0; r < numRows; r++) {
    heightfieldMatrix[r] = new Array(numCols).fill(veryLowHeight);
  }

  for (const hexInfo of allHexInfo) {
    const r: number = hexInfo.j - paddedMinJ;
    const c: number = hexInfo.i - paddedMinI;
    if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
        const physicsHeight: number = hexInfo.materialType === 'grass' ? 0 : hexInfo.height;
        heightfieldMatrix[r][c] = physicsHeight;
    }
  }

  for (const hexInfo of allHexInfo) {
    const currentPosition: THREE.Vector2 = hexInfo.position;
    const tileX: number = hexInfo.i;
    const tileY: number = hexInfo.j;
    const materialType: string = hexInfo.materialType;
    const currentHeight: number = hexInfo.height;

    if (!groupedInstanceData[materialType]) {
      console.warn("Unknown material type in JSON data:", materialType, "for tile", tileX, tileY);
      continue;
    }

    dummy.position.set(currentPosition.x, currentHeight * 0.5, currentPosition.y);
    const baseGeometryHeight: number = 1;
    dummy.scale.set(1, currentHeight / baseGeometryHeight, 1);
    dummy.updateMatrix();

    const perGroupInstanceId: number = groupedInstanceData[materialType].length;
    groupedInstanceData[materialType].push({
      matrix: dummy.matrix.clone(),
      tileX: tileX, tileY: tileY,
      worldPos: currentPosition.clone() as THREE.Vector2, // Ensure Vector2 type
      baseHeight: currentHeight,
      perGroupInstanceId: perGroupInstanceId
    });

    const mapKey: string = `${tileX},${tileY}`;
    hexDataMap.set(mapKey, {
      tileX: tileX, tileY: tileY,
      worldPos: currentPosition.clone() as THREE.Vector2, // Ensure Vector2 type
      baseHeight: currentHeight,
      materialType: materialType,
      perGroupInstanceId: perGroupInstanceId
    });
  }

  if (heightfieldMatrix.length > 0 && heightfieldMatrix[0].length > 0 && numCols > 0 && numRows > 0) {
    const elementSizeForHeightfield: number = 0.5;
    const heightfieldShape = new CANNON.Heightfield(heightfieldMatrix, { elementSize: elementSizeForHeightfield });
    const hfBody: CANNON.Body = new CANNON.Body({ mass: 0, material: defaultMaterial });
    const quaternion: CANNON.Quaternion = new CANNON.Quaternion();
    quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    hfBody.addShape(heightfieldShape, new CANNON.Vec3(), quaternion);

    const paddedMinCornerWorldPos: THREE.Vector2 = tileToPosition(paddedMinI, paddedMinJ);
    const totalWidth: number = (numCols - 1) * elementSizeForHeightfield;
    const totalDepth: number = (numRows - 1) * elementSizeForHeightfield;
    hfBody.position.set(
      paddedMinCornerWorldPos.x + totalWidth * 0.5,
      0,
      paddedMinCornerWorldPos.y + totalDepth * 0.5
    );
    world.addBody(hfBody);
  }

  const baseHexGeo: THREE.CylinderGeometry = new CylinderGeometry(1, 1, 1, 6, 1, false);

  for (const type in groupedInstanceData) {
    const instances: GroupedInstance[] = groupedInstanceData[type];
    if (instances.length > 0) {
      let material: THREE.Material | THREE.Material[];
      if (type === "grass") {
        const grassMaterials: THREE.MeshPhysicalMaterial[] = (textures.grass as THREE.Texture[]).map(tex =>
            hexMeshMaterial(tex, envmap, textures.grassNormal as THREE.Texture | undefined) as THREE.MeshPhysicalMaterial
        );
        const instancedHexMesh = new THREE.InstancedMesh(baseHexGeo, grassMaterials[0], instances.length);
        instancedHexMesh.castShadow = true;
        instancedHexMesh.receiveShadow = true;
        instancedHexMesh.userData.materialType = type;
        instancedMeshes[type] = instancedHexMesh;
        for (let i = 0; i < instances.length; i++) {
          instancedHexMesh.setMatrixAt(i, instances[i].matrix);
          if (instancedHexMesh.setColorAt) { // setColorAt might not exist on all Material types, check
            instancedHexMesh.setColorAt(i, new THREE.Color(1, 1, 1));
          }
          // This way of assigning material per instance is not standard for InstancedMesh.
          // Material variation is usually handled via attributes or texture atlases in shader.
          // For simplicity in conversion, this line is problematic and likely needs a different approach
          // for per-instance material variation in Three.js (e.g. multi-material group or shader).
          // Current approach: assign one of the materials randomly to the whole InstancedMesh. This is not per-instance.
          // A proper fix would require more significant refactoring or using a different Three.js feature.
        }
        // Assign a random grass material to the entire instanced mesh. This is a simplification.
        instancedHexMesh.material = grassMaterials[Math.floor(Math.random() * grassMaterials.length)];
        instancedHexMesh.instanceMatrix.needsUpdate = true;
        scene.add(instancedHexMesh);
        allHexMeshes.push(instancedHexMesh);
        continue; // Skip to next type
      } else {
        material = hexMeshMaterial(textures[type] as THREE.Texture, envmap);
      }
      const instancedHexMesh = new THREE.InstancedMesh(baseHexGeo, material as THREE.Material, instances.length);
      instancedHexMesh.castShadow = true;
      instancedHexMesh.receiveShadow = true;
      instancedHexMesh.userData.materialType = type;
      instancedMeshes[type] = instancedHexMesh;
      for (let i = 0; i < instances.length; i++) {
        instancedHexMesh.setMatrixAt(i, instances[i].matrix);
      }
      instancedHexMesh.instanceMatrix.needsUpdate = true;
      scene.add(instancedHexMesh);
      allHexMeshes.push(instancedHexMesh);
    }
  }

  let seaTexture: THREE.Texture = textures.water as THREE.Texture;
  seaTexture.repeat = new Vector2(1, 1);
  seaTexture.wrapS = RepeatWrapping;
  seaTexture.wrapT = RepeatWrapping;

  // seaMesh, mapContainer, mapFloor are commented out in original, keeping them so.

  const radius: number = 1;
  const sphereBody: CANNON.Body = new CANNON.Body({
    mass: 5,
    shape: new CANNON.Sphere(radius),
    material: defaultMaterial,
    angularDamping: 0.8,
    linearDamping: 0.5,
    collisionResponse: true,
  });
  sphereBody.sleepSpeedLimit = 0.2;
  sphereBody.sleepTimeLimit = 0.5;
  sphereBody.position.set(0, Math.max(MAX_HEIGHT + radius + 0.2, surfaceHeight), 0);
  sphereBody.ccdSpeedThreshold = 10;
  sphereBody.ccdSweptSphereRadius = radius * 0.9;
  world.addBody(sphereBody);

  const sphereGeometry: THREE.SphereGeometry = new SphereGeometry(radius);
  const baseSphereMaterial: THREE.MeshStandardMaterial = new MeshStandardMaterial({
    color: 0xff0000,
    envMap: envmap,
  });
  const sphereMesh: THREE.Mesh = new Mesh(sphereGeometry, baseSphereMaterial.clone());
  sphereMesh.castShadow = true;
  sphereMesh.receiveShadow = true;
  scene.add(sphereMesh);

  const NUM_ADDITIONAL_SPHERES: number = 4;
  const additionalSphereBodies: CANNON.Body[] = [];
  const additionalSphereMeshes: THREE.Mesh[] = [];

  for (let i: number = 0; i < NUM_ADDITIONAL_SPHERES; i++) {
    const additionalRadius: number = radius;
    const body: CANNON.Body = new CANNON.Body({
      mass: 5,
      shape: new CANNON.Sphere(additionalRadius),
      material: defaultMaterial,
      angularDamping: 0.8,
      linearDamping: 0.5,
      collisionResponse: true,
    });
    body.sleepSpeedLimit = 0.2;
    body.sleepTimeLimit = 0.5;

    const angle: number = (i / NUM_ADDITIONAL_SPHERES) * Math.PI * 2;
    const xOffset: number = Math.cos(angle) * 4;
    const zOffset: number = Math.sin(angle) * 4;
    body.position.set(xOffset, Math.max(MAX_HEIGHT + additionalRadius + 0.2, surfaceHeight), zOffset);

    body.ccdSpeedThreshold = 10;
    body.ccdSweptSphereRadius = additionalRadius * 0.9;
    world.addBody(body);
    additionalSphereBodies.push(body);

    const mesh: THREE.Mesh = new Mesh(sphereGeometry, baseSphereMaterial.clone());
    (mesh.material as THREE.MeshStandardMaterial).color.setHex(Math.random() * 0xffffff);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    additionalSphereMeshes.push(mesh);
  }

  let isSphereAnimating: boolean = false;
  let sphereAnimationStartTime: number = 0;
  const sphereAnimationDuration: number = 300;
  let sphereAnimationStartPos: CANNON.Vec3 = new CANNON.Vec3();
  let sphereAnimationTargetPos: CANNON.Vec3 = new CANNON.Vec3();
  let currentPath: AStarNode[] = [];
  let currentPathIndex: number = 0;

  let isHexLifting: boolean = false;
  let liftedHexInfo: LiftedHexInfo | null = null;
  const HEX_LIFT_AMOUNT: number = 0.5;
  const HEX_LIFT_DURATION: number = 150;

  const JUMP_FORCE: number = 30;
  let isRightMouseDown: boolean = false;

  const mouse: THREE.Vector2 = new Vector2();

  renderer.domElement.addEventListener('mousedown', onMouseDown as EventListener, false);
  renderer.domElement.addEventListener('mouseup', onMouseUp as EventListener, false);
  renderer.domElement.addEventListener('contextmenu', (event: MouseEvent) => event.preventDefault());

  function onMouseUp(event: MouseEvent): void {
    if (event.button === 2) {
      isRightMouseDown = false;
    }
  }

  function onMouseDown(event: MouseEvent): void {
    event.preventDefault();

    if (event.button === 0) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

      const threeRaycaster: THREE.Raycaster = new Raycaster();
      threeRaycaster.setFromCamera(mouse, camera);
      const intersects: THREE.Intersection[] = threeRaycaster.intersectObjects(allHexMeshes, false);

      let finalClickedHexData: HexData | null = null;
      if (intersects.length > 0) {
        const intersection = intersects[0];
        if (intersection.object instanceof THREE.InstancedMesh && intersection.instanceId !== undefined) {
          const hitInstancedMesh = intersection.object as THREE.InstancedMesh;
          const clickedInstanceId = intersection.instanceId;
          const materialType = hitInstancedMesh.userData.materialType as string;
          for (const [_key, data] of hexDataMap) {
            if (data.materialType === materialType && data.perGroupInstanceId === clickedInstanceId) {
              finalClickedHexData = data;
              break;
            }
          }
        }
      }

      if (finalClickedHexData && !isHexLifting && !isSphereAnimating) {
        const { materialType, perGroupInstanceId, worldPos, baseHeight, tileX, tileY } = finalClickedHexData;
        const targetInstancedMesh = instancedMeshes[materialType!]; // Non-null assertion, as it should exist
        if (targetInstancedMesh && perGroupInstanceId !== undefined) {
          const sphereCurrentHex = getSphereCurrentHexCoords(sphereBody.position);
          let allowHexLift = true;
          if (sphereCurrentHex && sphereCurrentHex.tileX === tileX && sphereCurrentHex.tileY === tileY) {
            allowHexLift = false;
          }
          if (allowHexLift) {
            isHexLifting = true;
            const originalMatrix = new THREE.Matrix4();
            targetInstancedMesh.getMatrixAt(perGroupInstanceId, originalMatrix);
            liftedHexInfo = {
              instancedMesh: targetInstancedMesh,
              instanceId: perGroupInstanceId,
              originalMatrix: originalMatrix,
              liftStartTime: performance.now(),
              yOffset: 0
            };
          }
          const startHexCoords = getSphereCurrentHexCoords(sphereBody.position);
          const targetHexCoords = { tileX: tileX!, tileY: tileY! };
          if (startHexCoords) {
            currentPath = aStarPathfinding(startHexCoords, targetHexCoords);
            if (currentPath.length > 0) {
              currentPathIndex = 0;
              const firstStepNode = currentPath[currentPathIndex];
              sphereAnimationStartPos.copy(sphereBody.position);
              const sphereRadiusInternal = (sphereBody.shapes[0] as CANNON.Sphere).radius;
              const targetHexWorldPos = firstStepNode.worldPos;
              const rayFromCannonForLanding = new CANNON.Vec3(targetHexWorldPos.x, MAX_HEIGHT + sphereRadiusInternal + 5, targetHexWorldPos.y);
              const rayToCannonForLanding = new CANNON.Vec3(targetHexWorldPos.x, -MAX_HEIGHT, targetHexWorldPos.y);
              const cannonResultForLanding = new CANNON.RaycastResult();
              world.raycastClosest(rayFromCannonForLanding, rayToCannonForLanding, { checkCollisionResponse: false }, cannonResultForLanding);
              let targetY = firstStepNode.baseHeight + sphereRadiusInternal + 0.075;
              if (cannonResultForLanding.hasHit) {
                targetY = cannonResultForLanding.hitPointWorld.y + sphereRadiusInternal + 0.075;
              }
              sphereAnimationTargetPos.set(firstStepNode.worldPos.x, targetY, firstStepNode.worldPos.y);
              isSphereAnimating = true;
              sphereAnimationStartTime = performance.now();
            }
          }
        }
      } else if (finalClickedHexData) {
        // console.log("Hex identified by THREE.js raycast, but sphere/hex is already animating:", finalClickedHexData);
      } else {
        // console.log("No specific hex identified by THREE.js click.");
      }
    } else if (event.button === 2 && !isRightMouseDown) {
      isRightMouseDown = true;
      const spherePos = sphereBody.position;
      const rayFrom = new CANNON.Vec3(spherePos.x, spherePos.y, spherePos.z);
      const rayTo = new CANNON.Vec3(spherePos.x, spherePos.y - radius - 0.1, spherePos.z);
      const result = new CANNON.RaycastResult();
      world.raycastClosest(rayFrom, rayTo, { collisionFilterGroup: 1, collisionFilterMask: 1 }, result);

      if (result.hasHit && result.body !== sphereBody) {
        sphereBody.applyImpulse(new CANNON.Vec3(0, JUMP_FORCE, 0), sphereBody.position);
        if(sphereBody.sleepState === CANNON.Body.SLEEPING) {
          sphereBody.wakeUp();
        }
      }
    }
  }

  renderer.setAnimationLoop(() => {
    controls.update();
    stats.begin();
    const time: number = performance.now() / 1000;
    const currentTimeMs: number = performance.now();

    const maxSubSteps: number = 10;
    if (!lastCallTime) {
      world.step(timeStep, timeStep, maxSubSteps);
    } else {
      const dt: number = time - lastCallTime;
      world.step(timeStep, dt, maxSubSteps);
    }
    lastCallTime = time;

    if (isHexLifting && liftedHexInfo) {
      const elapsedTime: number = currentTimeMs - liftedHexInfo.liftStartTime;
      let liftProgress: number = elapsedTime / HEX_LIFT_DURATION;
      let currentYOffset: number;

      if (liftProgress <= 1) {
        currentYOffset = HEX_LIFT_AMOUNT * liftProgress;
      } else if (liftProgress <= 2) {
        currentYOffset = HEX_LIFT_AMOUNT * (1 - (liftProgress - 1));
      } else {
        currentYOffset = 0;
        isHexLifting = false;
        liftedHexInfo.instancedMesh.setMatrixAt(liftedHexInfo.instanceId, liftedHexInfo.originalMatrix);
        liftedHexInfo.instancedMesh.instanceMatrix.needsUpdate = true;
        liftedHexInfo = null;
      }

      if (liftedHexInfo) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        liftedHexInfo.originalMatrix.decompose(position, quaternion, scale);
        position.y += currentYOffset;
        const newMatrix = new THREE.Matrix4().compose(position, quaternion, scale);
        liftedHexInfo.instancedMesh.setMatrixAt(liftedHexInfo.instanceId, newMatrix);
        liftedHexInfo.instancedMesh.instanceMatrix.needsUpdate = true;
      }
    }

    if (isSphereAnimating) {
      const elapsedTime: number = performance.now() - sphereAnimationStartTime;
      let progress: number = elapsedTime / sphereAnimationDuration;

      if (progress >= 1) {
        progress = 1;
        isSphereAnimating = false;
        let clampedY: number = Math.max(sphereAnimationTargetPos.y, surfaceHeight);
        sphereBody.position.set(sphereAnimationTargetPos.x, clampedY, sphereAnimationTargetPos.z);
        sphereBody.velocity.set(0,0,0);
        sphereBody.angularVelocity.set(0,0,0);

        currentPathIndex++;
        if (currentPath.length > 0 && currentPathIndex < currentPath.length) {
          const nextStepNode = currentPath[currentPathIndex];
          sphereAnimationStartPos.copy(sphereBody.position);
          const sphereRadius = (sphereBody.shapes[0] as CANNON.Sphere).radius;

          const nextHexWorldPos = nextStepNode.worldPos;
          const rayFromNext = new CANNON.Vec3(nextHexWorldPos.x, MAX_HEIGHT + sphereRadius + 5, nextHexWorldPos.y);
          const rayToNext = new CANNON.Vec3(nextHexWorldPos.x, -MAX_HEIGHT, nextHexWorldPos.y);
          const resultNext = new CANNON.RaycastResult();
          world.raycastClosest(rayFromNext, rayToNext, { checkCollisionResponse: false }, resultNext);

          let nextTargetY: number = nextStepNode.baseHeight + sphereRadius;
          if (resultNext.hasHit) {
            nextTargetY = resultNext.hitPointWorld.y + sphereRadius + 0.075;
          }

          sphereAnimationTargetPos.set(nextStepNode.worldPos.x, nextTargetY, nextStepNode.worldPos.y);
          isSphereAnimating = true;
          sphereAnimationStartTime = performance.now();
        } else {
          currentPath = [];
          currentPathIndex = 0;
        }
      } else {
        const newX: number = sphereAnimationStartPos.x + (sphereAnimationTargetPos.x - sphereAnimationStartPos.x) * progress;
        let newY: number = sphereAnimationStartPos.y + (sphereAnimationTargetPos.y - sphereAnimationStartPos.y) * progress;
        newY = Math.max(newY, surfaceHeight);
        const newZ: number = sphereAnimationStartPos.z + (sphereAnimationTargetPos.z - sphereAnimationStartPos.z) * progress;
        sphereBody.position.set(newX, newY, newZ);
      }
      sphereBody.velocity.set(0, 0, 0);
      sphereBody.angularVelocity.set(0, 0, 0);
    }

    sphereMesh.position.copy(sphereBody.position);
    const sphereHex = getSphereCurrentHexCoords(sphereBody.position);
    if (sphereHex) {
      const hexNode = getHexNode(sphereHex.tileX, sphereHex.tileY);
      if (hexNode) {
        const topY: number = hexNode.baseHeight + radius;
        if (sphereMesh.position.y < topY) {
          sphereMesh.position.y = topY;
        }
      }
    }

    for (let i = 0; i < additionalSphereMeshes.length; i++) {
      const body = additionalSphereBodies[i];
      const mesh = additionalSphereMeshes[i];

      if (body && mesh) {
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);

        const ballHex = getSphereCurrentHexCoords(body.position);
        if (ballHex) {
          const hexNode = getHexNode(ballHex.tileX, ballHex.tileY);
          if (hexNode) {
            const topY: number = Math.max(surfaceHeight, hexNode.baseHeight + radius);
            if (mesh.position.y < topY) {
              mesh.position.y = topY;
            }
          }
        }

        const RANDOM_MOVEMENT_PROBABILITY: number = 0.005;
        const RANDOM_IMPULSE_STRENGTH: number = 5;

        if (Math.random() < RANDOM_MOVEMENT_PROBABILITY) {
          const randomForce = new CANNON.Vec3(
            (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH,
            Math.random() * RANDOM_IMPULSE_STRENGTH * 0.2,
            (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH
          );
          body.applyImpulse(randomForce, body.position);
          if (body.sleepState === CANNON.Body.SLEEPING) {
            body.wakeUp();
          }
        }
      }
    }

    renderer.render(scene, camera);
    stats.end();
  });
})();

function tileToPosition(tileX: number, tileY: number): THREE.Vector2 {
  return new Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
}

function hexGeometry(height: number, position: THREE.Vector2): THREE.CylinderGeometry {
  let geo: THREE.CylinderGeometry  = new CylinderGeometry(1, 1, height, 6, 1, false);
  geo.translate(position.x, height * 0.5, position.y);
  return geo;
}

// These height constants are not used in the new JSON-driven approach, but kept for reference if needed.
// const STONE_HEIGHT: number = MAX_HEIGHT * 0.97;
// const DIRT_HEIGHT: number = MAX_HEIGHT * 0.7;
// const GRASS_HEIGHT: number = MAX_HEIGHT * 0.5;
// const SAND_HEIGHT: number = MAX_HEIGHT * 0.3;
// const DIRT2_HEIGHT: number = MAX_HEIGHT * 0.15;

// The `hex` function appears to be entirely superseded by the instanced mesh approach loading from JSON.
// It was responsible for creating individual meshes and physics bodies per hex.
// I'll comment it out as it's no longer called and its logic is handled differently.
/*
function hex(height: number, position: THREE.Vector2, tileX: number, tileY: number, textures: Textures, envmap: THREE.Texture): void {
  let baseGeo = hexGeometry(height, position);
  let textureType: string = "";
  let finalGeo: BufferGeometry = baseGeo;
  let material: THREE.Material;

  if (height > STONE_HEIGHT) {
    textureType = "stone";
    material = hexMeshMaterial(textures.stone as THREE.Texture, envmap);
    if (Math.random() > 0.8) {
      finalGeo = mergeBufferGeometries([finalGeo, stone(height, position)]);
    }
  } else if (height > DIRT_HEIGHT) {
    textureType = "dirt";
    material = hexMeshMaterial(textures.dirt as THREE.Texture, envmap);
    if (Math.random() > 0.8) {
      finalGeo = mergeBufferGeometries([finalGeo, tree(height, position)]);
    }
  } else if (height > GRASS_HEIGHT) {
    textureType = "grass";
    // Assuming textures.grass is an array, pick one. For simplicity, the first one.
    material = hexMeshMaterial(textures.grass[0] as THREE.Texture, envmap, textures.grassNormal as THREE.Texture | undefined);
  } else if (height > SAND_HEIGHT) {
    textureType = "sand";
    material = hexMeshMaterial(textures.sand as THREE.Texture, envmap);
    if (Math.random() > 0.8) {
      const stoneScatterGeo = stone(height, position);
      if (stoneScatterGeo) finalGeo = mergeBufferGeometries([finalGeo, stoneScatterGeo]);
    }
  } else if (height > DIRT2_HEIGHT) {
    textureType = "dirt2";
    material = hexMeshMaterial(textures.dirt2 as THREE.Texture, envmap);
  } else {
    return;
  }

  const mesh = new Mesh(finalGeo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.userData = {
    isHexTile: true,
    tileX: tileX,
    tileY: tileY,
    noiseHeight: height, // This was Simplex noise height, now it's general height
    worldPosition: position.clone(),
    textureType: textureType,
    baseHexHeight: height
  };

  scene.add(mesh);
  // allHexMeshes.push(mesh); // Original allHexMeshes was for individual meshes

  const mapKey = `${tileX},${tileY}`;
  hexDataMap.set(mapKey, {
    mesh: mesh,
    tileX: tileX,
    tileY: tileY,
    worldPos: position.clone() as THREE.Vector2,
    baseHeight: height,
    materialType: textureType // Added materialType here
  });
}
*/

function hexMeshMaterial(map: THREE.Texture, envmap: THREE.Texture, normalMap?: THREE.Texture): THREE.MeshPhysicalMaterial {
  const matParams: THREE.MeshPhysicalMaterialParameters = {
    envMap: envmap,
    envMapIntensity: 0.135,
    flatShading: true,
    map: map
  };
  if (normalMap) {
    matParams.normalMap = normalMap;
    matParams.normalScale = new THREE.Vector2(1, 1);
    matParams.normalMapType = TangentSpaceNormalMap; // Added for clarity, default but good to specify
  }
  return new MeshPhysicalMaterial(matParams);
}

function tree(height: number, position: THREE.Vector2): THREE.BufferGeometry {
  const treeHeight: number = Math.random() * 1 + 1.25;

  const geo: THREE.CylinderGeometry = new CylinderGeometry(0, 1.5, treeHeight, 3);
  geo.translate(position.x, height + treeHeight * 0 + 1, position.y);

  const geo2: THREE.CylinderGeometry = new CylinderGeometry(0, 1.15, treeHeight, 3);
  geo2.translate(position.x, height + treeHeight * 0.6 + 1, position.y);

  const geo3: THREE.CylinderGeometry = new CylinderGeometry(0, 0.8, treeHeight, 3);
  geo3.translate(position.x, height + treeHeight * 1.25 + 1, position.y);

  return mergeBufferGeometries([geo, geo2, geo3])!;
}

function stone(height: number, position: THREE.Vector2): THREE.SphereGeometry {
  const px: number = Math.random() * 0.4;
  const pz: number = Math.random() * 0.4;

  const geo: THREE.SphereGeometry = new SphereGeometry(Math.random() * 0.3 + 0.1, 7, 7);
  geo.translate(position.x + px, height, position.y + pz);

  return geo;
}

/* // clouds function is removed in original, keeping it so.
function clouds() {
  ...
}
*/

function getHexNode(tileX: number, tileY: number): HexData | undefined {
  return hexDataMap.get(`${tileX},${tileY}`);
}

function getSphereCurrentHexCoords(sphereBodyPos: CANNON.Vec3): { tileX: number; tileY: number } | null {
  let closestHex: HexData | null = null;
  let minDistanceSq: number = Infinity;

  for (const [_key, hexData] of hexDataMap) {
    const dx: number = sphereBodyPos.x - hexData.worldPos.x;
    const dz: number = sphereBodyPos.z - hexData.worldPos.y;
    const distanceSq: number = dx * dx + dz * dz;

    if (distanceSq < minDistanceSq) {
      minDistanceSq = distanceSq;
      closestHex = hexData;
    }
  }
  return closestHex ? { tileX: closestHex.tileX, tileY: closestHex.tileY } : null;
}

function aStarPathfinding(startCoords: { tileX: number; tileY: number }, targetCoords: { tileX: number; tileY: number }): AStarNode[] {
  const openSet: Map<string, AStarNode> = new Map();
  const closedSet: Set<string> = new Set();

  const startNodeData = getHexNode(startCoords.tileX, startCoords.tileY);
  if (!startNodeData) return [];

  const targetNodeData = getHexNode(targetCoords.tileX, targetCoords.tileY);
  if (!targetNodeData) return [];

  const startKey: string = `${startCoords.tileX},${startCoords.tileY}`;
  const startNode: AStarNode = {
    ...startNodeData,
    gCost: 0,
    hCost: heuristic(startCoords, targetCoords),
    fCost: heuristic(startCoords, targetCoords),
    parent: null
  };
  openSet.set(startKey, startNode);

  while (openSet.size > 0) {
    let currentNodeEntry: [string, AStarNode] | null = null;
    for (const entry of openSet.entries()) {
      if (currentNodeEntry === null || entry[1].fCost < currentNodeEntry[1].fCost) {
        currentNodeEntry = entry;
      }
    }

    if (!currentNodeEntry) return []; // Should not happen if openSet is not empty

    const currentKey: string = currentNodeEntry[0];
    const currentNode: AStarNode = currentNodeEntry[1];

    if (currentKey === `${targetCoords.tileX},${targetCoords.tileY}`) {
      return reconstructPath(currentNode);
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    for (const neighborCoords of getHexNeighbors(currentNode.tileX, currentNode.tileY)) {
      const neighborKey: string = `${neighborCoords.tileX},${neighborCoords.tileY}`;
      if (closedSet.has(neighborKey)) continue;

      const neighborNodeData = getHexNode(neighborCoords.tileX, neighborCoords.tileY);
      if (!neighborNodeData) continue;

      const gCostToNeighbor: number = currentNode.gCost + 1;

      let neighborNode: AStarNode | undefined = openSet.get(neighborKey);
      if (!neighborNode || gCostToNeighbor < neighborNode.gCost) {
        if (!neighborNode) {
          neighborNode = {
            ...neighborNodeData,
            gCost: 0, hCost: 0, fCost: 0, // Will be overwritten
            parent: null
          } as AStarNode;
        }
        neighborNode.parent = currentNode;
        neighborNode.gCost = gCostToNeighbor;
        neighborNode.hCost = heuristic(neighborCoords, targetCoords);
        neighborNode.fCost = neighborNode.gCost + neighborNode.hCost;
        openSet.set(neighborKey, neighborNode);
      }
    }
  }
  return [];
}

function heuristic(a: { tileX: number; tileY: number }, b: { tileX: number; tileY: number }): number {
  const dX: number = Math.abs(a.tileX - b.tileX);
  const dY: number = Math.abs(a.tileY - b.tileY);
  return dX + dY;
}

interface HexNeighborDirection {
    tileX: number;
    tileY: number;
}

function getHexNeighbors(tileX: number, tileY: number): { tileX: number; tileY: number }[] {
  const neighbors: { tileX: number; tileY: number }[] = [];
  const isEvenRow: boolean = tileY % 2 === 0;
  const directions: HexNeighborDirection[] = [
    { tileX:  1, tileY:  0 }, { tileX: -1, tileY:  0 },
    { tileX: isEvenRow ?  0 :  1, tileY: -1 }, { tileX: isEvenRow ? -1 :  0, tileY: -1 },
    { tileX: isEvenRow ?  0 :  1, tileY:  1 }, { tileX: isEvenRow ? -1 :  0, tileY:  1 }
  ];

  for (const dir of directions) {
    neighbors.push({ tileX: tileX + dir.tileX, tileY: tileY + dir.tileY });
  }
  return neighbors;
}

function reconstructPath(targetNode: AStarNode): AStarNode[] {
  const path: AStarNode[] = [];
  let currentNode: AStarNode | null = targetNode;
  while (currentNode) {
    path.push(currentNode); // Pushing the full AStarNode
    currentNode = currentNode.parent;
  }
  return path.reverse();
}

const stats: Stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

function worldPointToHexCoords(worldPoint: THREE.Vector3): { tileX: number; tileY: number } | null {
  let closestHexData: HexData | null = null;
  let minDistanceSq: number = Infinity;
  const pX: number = worldPoint.x;
  const pZ: number = worldPoint.z;

  for (const [_key, hexData] of hexDataMap) {
    const dx: number = pX - hexData.worldPos.x;
    const dz: number = pZ - hexData.worldPos.y;
    const distanceSq: number = dx * dx + dz * dz;

    if (distanceSq < minDistanceSq) {
      minDistanceSq = distanceSq;
      closestHexData = hexData;
    }
  }

  if (closestHexData && minDistanceSq < (1.0 * 1.0)) {
    return { tileX: closestHexData.tileX, tileY: closestHexData.tileY };
  }
  return null;
}
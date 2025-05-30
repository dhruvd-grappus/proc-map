import * as THREE from 'three'; // Preserve THREE namespace if some modules rely on it directly
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';
import { OrbitControls } from 'three-stdlib/controls/OrbitControls';

// Global setters and state from globals.ts
import {
  scene, // direct usage if already initialized and exported
  world,
  camera,
  renderer,
  pmrem,
  envmap,
  controls,
  stats,
  lastCallTime,
  timeStep,
  textures,
  instancedMeshes,
  allHexMeshes,
  hexDataMap,
  MAX_HEIGHT,
  SURFACE_HEIGHT,
  NUM_ADDITIONAL_SPHERES,
  defaultMaterial, // Make sure it's initialized or provided
  setStats, setScene, setWorld, setCamera, setRenderer, setPmrem, setEnvmap, setControls, setLastCallTime,
  // sphereAnimationState, hexLiftAnimationState // these are used by animation.ts
} from './globals';

// Setup functions
import { initializeScene, initializeCamera, initializeRenderer, initializeLights, initializeOrbitControls, loadEnvironmentMap, loadTextures, setRendererCamera } from './sceneSetup';
import { generateHexagonGrid, createSeaMesh, createMapContainer, createMapFloor } from './mapCreation';
import { initializePhysicsWorld, updatePhysics } from './physics';
import { createPlayerSphere, createAdditionalSpheres, updateAISpheres, getSphereCurrentHexCoords } from './sphereControls';
import { setupMouseInteraction } from './eventHandling';
import { updateAnimations } from './animation';

async function mainGameSetup() {
  const appContainer = document.querySelector<HTMLDivElement>('#app');
  if (!appContainer) {
    console.error("Main application container #app not found!");
    return;
  }

  // Stats
  const localStats = new Stats();
  localStats.showPanel(0);
  document.body.appendChild(localStats.dom);
  setStats(localStats); // Set global stats

  // Scene, Camera, Renderer
  const localScene = initializeScene();
  setScene(localScene); // Set global scene

  const localCamera = initializeCamera(window.innerWidth / window.innerHeight);
  setCamera(localCamera); // Set global camera

  const localRenderer = initializeRenderer(appContainer);
  setRenderer(localRenderer); // Set global renderer
  setRendererCamera(localRenderer, localCamera); // Link camera for resize

  // PMREM (used by env map loading, PMREMGenerator is created inside loadEnvironmentMap)
  // setPmrem(new THREE.PMREMGenerator(localRenderer)); // if pmrem itself needs to be global

  // Lights and Controls
  initializeLights(localScene); // Light is added to scene inside
  const localControls = initializeOrbitControls(localCamera, localRenderer.domElement);
  setControls(localControls); // Set global controls

  // Load Assets
  try {
    const localEnvmap = await loadEnvironmentMap(localRenderer, 'assets/envmap.hdr');
    setEnvmap(localEnvmap); // Set global envmap

    const texturePaths = {
      dirt: "assets/dirt.png",
      dirt2: "assets/dirt2.jpg",
      grass: "assets/grass.jpg",
      sand: "assets/sand.jpg",
      water: "assets/water.jpg",
      stone: "assets/stone.png",
    };
    const loadedTextures = await loadTextures(texturePaths);
    // Store textures globally (assuming 'textures' in globals.ts is an empty object ready to be populated)
    for (const key in loadedTextures) {
        textures[key] = loadedTextures[key];
    }

  } catch (error) {
    console.error("Error loading assets:", error);
    return; // Stop if assets fail to load
  }


  // Physics World
  const localWorld = initializePhysicsWorld();
  setWorld(localWorld); // Set global world

  // Map Generation (populates globalHexDataMap, globalInstancedMeshes, globalAllHexMeshes)
  generateHexagonGrid(textures, envmap, localScene, localWorld, hexDataMap, instancedMeshes, allHexMeshes);
  createSeaMesh(textures, envmap, localScene);
  createMapContainer(textures, envmap, localScene);
  createMapFloor(textures, envmap, localScene);


  // Player Sphere
  // Determine initial spawn: e.g., center of map, high above.
  // A simple way: use MAX_HEIGHT + radius + buffer. Or raycast from high up at (0, MAX_HEIGHT+10, 0) down to the ground.
  const playerSphereRadius = 1;
  const initialPlayerPos = new CANNON.Vec3(0, MAX_HEIGHT + playerSphereRadius + 2, 0); // Adjust as needed
  const { body: playerSphereBody, mesh: playerSphereMesh } = createPlayerSphere(localScene, localWorld, envmap, initialPlayerPos);

  // AI Spheres
  const aiSpheres = createAdditionalSpheres(NUM_ADDITIONAL_SPHERES, playerSphereRadius, localScene, localWorld, envmap, hexDataMap);

  // Event Handling
  setupMouseInteraction(localCamera, localRenderer.domElement, hexDataMap, instancedMeshes, allHexMeshes, playerSphereBody, localWorld, localScene);

  // Start Animation Loop
  setLastCallTime(performance.now() / 1000); // Initialize lastCallTime
  localRenderer.setAnimationLoop((animationLoopTime: DOMHighResTimeStamp) => 
    animateLoop(
      playerSphereBody, playerSphereMesh, aiSpheres, playerSphereRadius, 
      localControls, localWorld, localRenderer, localScene, localCamera, 
      localStats, timeStep
    )
  );
}

function animateLoop(
    pSphereBody: CANNON.Body,
    pSphereMesh: THREE.Mesh,
    currentAiSpheres: Array<{ body: CANNON.Body; mesh: THREE.Mesh }>,
    pSphereRadius: number,
    currentControls: OrbitControls, 
    currentWorld: CANNON.World, 
    currentRenderer: THREE.WebGLRenderer,
    currentScene: THREE.Scene, 
    currentCamera: THREE.PerspectiveCamera, 
    currentStats: Stats, 
    currentTimeStep: number 
) {
  currentControls.update();
  currentStats.begin();

  const time = performance.now() / 1000;
  setLastCallTime(updatePhysics(currentWorld, lastCallTime, time, currentTimeStep));

  updateAnimations(pSphereBody, currentWorld);

  pSphereMesh.position.copy(pSphereBody.position as unknown as THREE.Vector3);
  pSphereMesh.quaternion.copy(pSphereBody.quaternion as unknown as THREE.Quaternion);
  
  const playerHex = getSphereCurrentHexCoords(pSphereBody.position, hexDataMap);
    if (playerHex) {
      const hexNode = hexDataMap.get(`${playerHex.tileX},${playerHex.tileY}`);
      if (hexNode) {
        const topY = hexNode.baseHeight + pSphereRadius;
        if (pSphereMesh.position.y < topY) {
          pSphereMesh.position.y = topY;
        }
      }
    }

  updateAISpheres(currentAiSpheres, hexDataMap, pSphereRadius, SURFACE_HEIGHT);

  currentRenderer.render(currentScene, currentCamera);
  currentStats.end();
}

// Start the game
mainGameSetup().catch(err => console.error("Game initialization failed:", err));

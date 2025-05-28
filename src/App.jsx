import { useEffect, useRef } from "react";
import * as THREE from "https://cdn.skypack.dev/three@0.137";

import { OrbitControls } from "https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls";
import { RGBELoader } from "https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader";
import { mergeBufferGeometries } from "https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils";
import SimplexNoise from "https://cdn.skypack.dev/simplex-noise@3.0.0";
import { tileToPosition } from "./utils/gridUtils.js";
import {
  ASSETS,
  MAX_HEIGHT,
  STONE_HEIGHT,
  DIRT_HEIGHT,
  GRASS_HEIGHT,
  SAND_HEIGHT,
  DIRT2_HEIGHT,
} from "../game/constants.js";
import { hexGeometry } from "../game/terrainUtils.js";
import { tree, stone } from "../game/objectGenerators.js";
import { findPathAStar } from "../game/pathfinding.js";
import {
  hexMesh,
  createCloudsMesh,
  createSeaMesh,
  createMapContainerMesh,
  createMapFloorMesh,
} from "../three/meshUtils.js";
import Stats from '../three/libs/stats.module.js';

function App() {
  const mountRef = useRef();
  const clockRef = useRef(new THREE.Clock()); // Added clockRef
  const statsRef = useRef(null);
  const bigStoneSpriteRef = useRef(null);
  const currentBigStoneHexRef = useRef(null);
  const hexagonDataRef = useRef([]);
  const bigStonePathRef = useRef([]);
  const bigStoneHexDataPathRef = useRef([]);
  const bigStoneProgressRef = useRef(0);
  const bigStoneCurrentPathSegmentRef = useRef(0);
  const sceneRef = useRef(null); // For scene-related operations if needed by button
  const interactiveMeshesRef = useRef([]);

  const handleMoveToCenterClick = () => {
    console.log("Move to center button clicked.");
    if (!hexagonDataRef.current || hexagonDataRef.current.length === 0) {
      console.warn("Hexagon data not available.");
      return;
    }
    if (!currentBigStoneHexRef.current) {
      console.warn("Current big stone position not available.");
      return;
    }
    if (!bigStoneSpriteRef.current) {
      console.warn("Big stone sprite not available.");
      return;
    }
    console.log("Current big stone hex:", currentBigStoneHexRef.current ? currentBigStoneHexRef.current.id : 'None');

    let centerHex = hexagonDataRef.current.find(h => h.gridX === 0 && h.gridY === 0);

    if (!centerHex) {
      // Fallback: find hex closest to world origin (0,0)
      let minDistanceSq = Infinity;
      hexagonDataRef.current.forEach((hex) => {
        const distanceSq = hex.worldPosition.x * hex.worldPosition.x + hex.worldPosition.y * hex.worldPosition.y;
        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          centerHex = hex;
        }
      });
    }
    console.log("Center hex identified:", centerHex);

    if (centerHex && currentBigStoneHexRef.current && currentBigStoneHexRef.current.id !== centerHex.id) {
      const returnedPath = findPathAStar(
        currentBigStoneHexRef.current,
        centerHex,
        hexagonDataRef.current
      );

      if (returnedPath && returnedPath.length > 0) {
        bigStoneHexDataPathRef.current = returnedPath;
        bigStonePathRef.current = returnedPath.map(
          (hex) =>
            new THREE.Vector3(
              hex.worldPosition.x,
              hex.height + 0.8, // Assuming 0.8 is stone's radius/offset
              hex.worldPosition.y
            )
        );
        bigStoneProgressRef.current = 0;
        bigStoneCurrentPathSegmentRef.current = 0;
        console.log("Path found for big stone to center. Target:", centerHex.id, "Path length:", bigStonePathRef.current.length);
      } else {
        console.log("No path to center found or stone already at center.");
        bigStonePathRef.current = [];
        bigStoneHexDataPathRef.current = [];
      }
    } else if (centerHex && currentBigStoneHexRef.current && currentBigStoneHexRef.current.id === centerHex.id) {
      console.log("Big stone is already at the center hex.");
    } else {
      // This case might be hit if centerHex is null after fallback, though unlikely with current fallback.
      console.warn("Could not determine center hex, or other issue in handleMoveToCenterClick.");
    }
  };

  useEffect(() => {
    let animationId;
    let renderer;
    let pmrem;
    // container will be mountRef.current, which is stable

    async function setupScene() {
      // Ensure mountRef.current is available before proceeding
      if (!mountRef.current) {
        console.error("Mount point not found at effect run time");
        return () => {}; // Return an empty cleanup function
      }
      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // --- Local Helper Functions ---
      let camera; // Declared here to be accessible by helpers and controls
      let controls; // Declared here for similar reasons
      let onCanvasClick; // For event listener cleanup

      // Helper to initialize core scene and camera
      const initializeCoreScene = () => {
        console.log("Initializing core scene...");
        sceneRef.current = new THREE.Scene();
        sceneRef.current.background = new THREE.Color("#FFEECC");
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(-17, 31, 33);
      };

      // Helper to initialize the WebGL renderer
      const initializeRenderer = () => {
        console.log("Initializing renderer...");
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.useLegacyLights = false; // Modern equivalent of physicallyCorrectLights
        renderer.shadowMap.enabled = true;
        // THREE.PCFSoftShadowMap provides softer shadows but is more performance-intensive.
        // Consider THREE.PCFShadowMap or THREE.BasicShadowMap if FPS is an issue.
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement); // renderer.domElement is the canvas

        // Initialize Stats.js
        statsRef.current = new Stats();
        statsRef.current.showPanel(0); // 0: fps, 1: ms, 2: mb
        statsRef.current.dom.style.position = 'absolute';
        statsRef.current.dom.style.top = '0px';
        statsRef.current.dom.style.left = '80px'; // Position next to the other button
        mountRef.current.appendChild(statsRef.current.dom); // Add stats panel to the main container

        console.log("Renderer and Stats initialized.");
      };

      // Helper to set up scene lighting
      const setupLighting = () => {
        console.log("Setting up lights...");
        const light = new THREE.PointLight(
          new THREE.Color("#FFCB8E").convertSRGBToLinear().convertSRGBToLinear(),
          80,
          200
        );
        light.position.set(10, 20, 10);
        light.castShadow = true;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 500;
        sceneRef.current.add(light);
        console.log("Lighting setup complete.");
      };

      // Helper to set up orbit controls
      const setupControls = () => {
        console.log("Setting up controls...");
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0);
        controls.dampingFactor = 0.05;
        controls.enableDamping = true;
        console.log("Controls setup complete.");
      };
      
      // Helper to set up PMREM Generator
      const setupPMREM = () => {
        console.log("Setting up PMREM...");
        pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        console.log("PMREM setup complete.");
      };

      // Variables for texture loading
      const loadingManager = new THREE.LoadingManager();
      const textureLoader = new THREE.TextureLoader(loadingManager);
      let textures = {}; // To store loaded textures
      let envmap; // To store the processed environment map

      // Helper to load all textures
      const loadAllTextures = async () => {
        console.log("Starting texture loading...");
        try {
          const hdrTexture = await new RGBELoader().loadAsync(ASSETS.envmap); 
          textures.envmap = hdrTexture;
        } catch (error) {
          console.error("Failed to load HDR envmap with loadAsync:", error);
        }
        
        textures.dirt = await textureLoader.loadAsync(ASSETS.dirt);
        textures.dirt2 = await textureLoader.loadAsync(ASSETS.dirt2);
        textures.grass = await textureLoader.loadAsync(ASSETS.grass);
        textures.sand = await textureLoader.loadAsync(ASSETS.sand);
        textures.water = await textureLoader.loadAsync(ASSETS.water);
        textures.stone = await textureLoader.loadAsync(ASSETS.stone);
        console.log("All textures loaded.");
      };
      
      // --- Main setup flow ---
      // Initialize core components
      initializeCoreScene();
      initializeRenderer();
      setupLighting();
      setupControls();
      setupPMREM();
      
      // Asynchronously load all textures
      await loadAllTextures();

      // Callback function to continue scene setup after textures are loaded
      const onRegularTexturesLoaded = () => {
        console.log("Processing textures and initializing scene elements...");
        if (!textures.envmap || typeof textures.envmap.mapping === "undefined") {
          console.error("HDR envmap (ASSETS.envmap) not loaded or invalid, cannot proceed with PMREM processing.", textures.envmap);
          return; 
        }
        envmap = pmrem.fromEquirectangular(textures.envmap).texture;

        let stoneGeo = new THREE.BoxGeometry(0,0,0);
        let dirtGeo = new THREE.BoxGeometry(0,0,0);
        let dirt2Geo = new THREE.BoxGeometry(0,0,0);
        let sandGeo = new THREE.BoxGeometry(0,0,0);
        let grassGeo = new THREE.BoxGeometry(0,0,0);

        // Terrain Generation
        console.log("Terrain generation started.");
        const simplex = new SimplexNoise();
        for (let i = -45; i <= 45; i++) {
          for (let j = -45; j <= 45; j++) {
            let position = tileToPosition(i, j);
            if (position.length() > 36) continue;
            let noiseVal = (simplex.noise2D(i * 0.1, j * 0.1) + 1) * 0.5;
            noiseVal = Math.pow(noiseVal, 1.5);
            let hexHeight = noiseVal * MAX_HEIGHT;
            let materialType = "unknown";
            let currentHexGeo;

            if (hexHeight > STONE_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              stoneGeo = mergeBufferGeometries([currentHexGeo, stoneGeo]);
              materialType = "stone";
              if (Math.random() > 0.8) stoneGeo = mergeBufferGeometries([stoneGeo, stone(hexHeight, position)]);
            } else if (hexHeight > DIRT_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              dirtGeo = mergeBufferGeometries([currentHexGeo, dirtGeo]);
              materialType = "dirt";
              if (Math.random() > 0.8) grassGeo = mergeBufferGeometries([grassGeo, tree(hexHeight, position)]);
            } else if (hexHeight > GRASS_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              grassGeo = mergeBufferGeometries([currentHexGeo, grassGeo]);
              materialType = "grass";
            } else if (hexHeight > SAND_HEIGHT) {
              currentHexGeo = hexGeometry(hexHeight, position);
              sandGeo = mergeBufferGeometries([currentHexGeo, sandGeo]);
              materialType = "sand";
              if (Math.random() > 0.8 && stoneGeo) stoneGeo = mergeBufferGeometries([stoneGeo, stone(hexHeight, position)]);
            } else {
              let geomHeight = Math.max(hexHeight, 0.01);
              currentHexGeo = hexGeometry(geomHeight, position);
              dirt2Geo = mergeBufferGeometries([currentHexGeo, dirt2Geo]);
              materialType = "dirt2";
            }
            hexagonDataRef.current.push({ gridX: i, gridY: j, worldPosition: position.clone(), height: hexHeight, materialType: materialType, id: `hex_${i}_${j}` });
          }
        }
        console.log("Terrain generation complete. Number of hexagons:", hexagonDataRef.current.length);

        // Create and Add Terrain Meshes
        let stoneMesh = hexMesh(textures.stone && stoneGeo, textures.stone, envmap, THREE);
        console.log("Stone mesh created:", stoneMesh ? stoneMesh.id : 'undefined');
        if (stoneMesh) {
          stoneMesh.frustumCulled = false;
          console.log("Set stoneMesh.frustumCulled to false");
        }
        let grassMesh = hexMesh(textures.grass && grassGeo, textures.grass, envmap, THREE);
        console.log("Grass mesh created:", grassMesh ? grassMesh.id : 'undefined');
        if (grassMesh) {
          grassMesh.frustumCulled = false;
          console.log("Set grassMesh.frustumCulled to false");
        }
        let dirt2Mesh = hexMesh(textures.dirt2 && dirt2Geo, textures.dirt2, envmap, THREE);
        console.log("Dirt2 mesh created:", dirt2Mesh ? dirt2Mesh.id : 'undefined');
        if (dirt2Mesh) {
          dirt2Mesh.frustumCulled = false;
          console.log("Set dirt2Mesh.frustumCulled to false");
        }
        let dirtMesh = hexMesh(textures.dirt && dirtGeo, textures.dirt, envmap, THREE);
        console.log("Dirt mesh created:", dirtMesh ? dirtMesh.id : 'undefined');
        if (dirtMesh) {
          dirtMesh.frustumCulled = false;
          console.log("Set dirtMesh.frustumCulled to false");
        }
        let sandMesh = hexMesh(textures.sand && sandGeo, textures.sand, envmap, THREE);
        console.log("Sand mesh created:", sandMesh ? sandMesh.id : 'undefined');
        if (sandMesh) {
          sandMesh.frustumCulled = false;
          console.log("Set sandMesh.frustumCulled to false");
        }
        sceneRef.current.add(stoneMesh, dirtMesh, dirt2Mesh, sandMesh, grassMesh);
        
        // Create and Add Environment Meshes (Sea, Map Borders, Clouds)
        const seaMesh = createSeaMesh(textures, envmap, MAX_HEIGHT, THREE);
        sceneRef.current.add(seaMesh);
        const mapContainer = createMapContainerMesh(textures, envmap, MAX_HEIGHT, THREE);
        sceneRef.current.add(mapContainer);
        const mapFloor = createMapFloorMesh(textures, envmap, MAX_HEIGHT, THREE);
        sceneRef.current.add(mapFloor);
        const cloudsMesh = createCloudsMesh(envmap, THREE, mergeBufferGeometries);
        sceneRef.current.add(cloudsMesh);

        // Initialize Big Stone Sprite
        const bigStoneSpeedUnitsPerSecond = 1.0; // Speed in units (segments) per second
        const yPositionSmoothingFactor = 0.2; // Smoothing factor for Y position updates
        // const bigStoneSpeed = 0.05; // Old constant, effectively removed/replaced
        const bigSpriteGeo = new THREE.SphereGeometry(0.8, 12, 10);
        const bigSpriteMat = new THREE.MeshStandardMaterial({ color: 0x6c757d, roughness: 0.7, metalness: 0.3 });
        bigStoneSpriteRef.current = new THREE.Mesh(bigSpriteGeo, bigSpriteMat);
        bigStoneSpriteRef.current.castShadow = true;
        bigStoneSpriteRef.current.name = "bigStoneSprite";
        if (hexagonDataRef.current.length > 0) {
          currentBigStoneHexRef.current = hexagonDataRef.current[0];
          bigStoneSpriteRef.current.position.set( currentBigStoneHexRef.current.worldPosition.x, currentBigStoneHexRef.current.height + 0.8, currentBigStoneHexRef.current.worldPosition.y);
          sceneRef.current.add(bigStoneSpriteRef.current);
          console.log("Big stone sprite initialized at:", bigStoneSpriteRef.current.position);
        } else {
          console.warn("No hexagons available to place the big stone sprite.");
          bigStoneSpriteRef.current = null;
        }

        // Setup Interactions (Raycasting and Click Events)
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        interactiveMeshesRef.current = [stoneMesh, dirtMesh, dirt2Mesh, sandMesh, grassMesh].filter(mesh => mesh && mesh.geometry && mesh.geometry.index !== null);

        onCanvasClick = (event) => {
          console.log("Canvas clicked. Mouse coordinates:", mouse.x, mouse.y);
          const rect = renderer.domElement.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(interactiveMeshesRef.current);
          if (intersects.length > 0) {
            const intersectionPoint = intersects[0].point;
            console.log("Intersection point:", intersectionPoint);
            let closestHex = null;
            let minDistanceSq = Infinity;
            hexagonDataRef.current.forEach((hex) => {
              const dx = hex.worldPosition.x - intersectionPoint.x;
              const dz = hex.worldPosition.y - intersectionPoint.z;
              const distanceSq = dx * dx + dz * dz;
              if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                closestHex = hex;
              }
            });
            console.log("Closest hex identified:", closestHex);
            if (closestHex && minDistanceSq < 2 * 2) {
              if (bigStoneSpriteRef.current && currentBigStoneHexRef.current && currentBigStoneHexRef.current.id !== closestHex.id) {
                const returnedPath = findPathAStar(currentBigStoneHexRef.current, closestHex, hexagonDataRef.current);
                if (returnedPath && returnedPath.length > 0) {
                  bigStoneHexDataPathRef.current = returnedPath;
                  bigStonePathRef.current = bigStoneHexDataPathRef.current.map(hex => new THREE.Vector3(hex.worldPosition.x, hex.height + 0.8, hex.worldPosition.y));
                  bigStoneProgressRef.current = 0;
                  bigStoneCurrentPathSegmentRef.current = 0;
                  console.log("Path found for big stone. Target:", closestHex.id, "Path length:", bigStonePathRef.current.length);
                } else {
                  console.log("No path found or target is current hex.");
                  bigStonePathRef.current = [];
                  bigStoneHexDataPathRef.current = [];
                }
              }
            }
          }
        };
        if (renderer && renderer.domElement) {
          renderer.domElement.addEventListener("click", onCanvasClick);
        }

        // Animation Loop
        function animate() {
          const deltaTime = clockRef.current.getDelta(); // Get delta time
          statsRef.current.begin(); // Begin FPS/MS monitoring

          controls.update();
          if (bigStoneSpriteRef.current && bigStonePathRef.current.length > 0 && bigStoneCurrentPathSegmentRef.current < bigStonePathRef.current.length - 1) {
            const currentSegmentStart = bigStonePathRef.current[bigStoneCurrentPathSegmentRef.current];
            const currentSegmentEnd = bigStonePathRef.current[bigStoneCurrentPathSegmentRef.current + 1];
            bigStoneProgressRef.current += bigStoneSpeedUnitsPerSecond * deltaTime; // Frame-rate independent progress
            console.log("Big stone moving. Current segment:", bigStoneCurrentPathSegmentRef.current, "Progress:", bigStoneProgressRef.current); // Added this log
            if (bigStoneProgressRef.current >= 1.0) {
              bigStoneProgressRef.current = 0;
              bigStoneCurrentPathSegmentRef.current++;
              if (bigStoneHexDataPathRef.current[bigStoneCurrentPathSegmentRef.current]) {
                currentBigStoneHexRef.current = bigStoneHexDataPathRef.current[bigStoneCurrentPathSegmentRef.current];
                console.log("Big stone reached segment end. New current hex:", currentBigStoneHexRef.current ? currentBigStoneHexRef.current.id : 'None');
              } else {
                if (bigStoneCurrentPathSegmentRef.current >= bigStonePathRef.current.length - 1 && bigStonePathRef.current.length > 0) {
                  const lastPathPoint = bigStonePathRef.current[bigStonePathRef.current.length - 1];
                  currentBigStoneHexRef.current = hexagonDataRef.current.find(h => h.worldPosition.x === lastPathPoint.x && h.worldPosition.y === lastPathPoint.z);
                  console.log("Big stone reached segment end (fallback). New current hex:", currentBigStoneHexRef.current ? currentBigStoneHexRef.current.id : 'None');
                }
              }
              if (bigStoneCurrentPathSegmentRef.current >= bigStonePathRef.current.length - 1) {
                console.log("Big stone reached final destination:", currentBigStoneHexRef.current ? currentBigStoneHexRef.current.id : 'None');
                bigStonePathRef.current = [];
                bigStoneHexDataPathRef.current = [];
              }
            }
            if (bigStonePathRef.current.length > 0 && bigStoneCurrentPathSegmentRef.current < bigStonePathRef.current.length - 1) {
              bigStoneSpriteRef.current.position.lerpVectors(currentSegmentStart, currentSegmentEnd, bigStoneProgressRef.current);
              
              // Y-Positioning via downward raycast (mid-path)
              console.log("Big stone LERPed Y (mid-path):", bigStoneSpriteRef.current.position.y);
              const downRaycaster = new THREE.Raycaster(
                new THREE.Vector3(
                  bigStoneSpriteRef.current.position.x,
                  bigStoneSpriteRef.current.position.y + 2.0, // Modified Y origin
                  bigStoneSpriteRef.current.position.z
                ),
                new THREE.Vector3(0, -1, 0)
              );
              const terrainIntersects = downRaycaster.intersectObjects(interactiveMeshesRef.current, false);
              if (terrainIntersects.length > 0) {
                const targetY = terrainIntersects[0].point.y + 0.8;
                bigStoneSpriteRef.current.position.y = THREE.MathUtils.lerp(
                    bigStoneSpriteRef.current.position.y,
                    targetY,
                    yPositionSmoothingFactor
                );
                console.log("Big stone raycast hit (mid-path). Smoothed New Y:", bigStoneSpriteRef.current.position.y);
              } else {
                // console.warn("Downward raycast for Y-positioning missed terrain at XZ:", bigStoneSpriteRef.current.position.x, bigStoneSpriteRef.current.position.z, "Maintaining Y from lerp/previous.");
              }
            } else if (bigStonePathRef.current.length > 0 && bigStoneCurrentPathSegmentRef.current === bigStonePathRef.current.length - 1) {
              bigStoneSpriteRef.current.position.copy(bigStonePathRef.current[bigStoneCurrentPathSegmentRef.current]);

              // Ensure Y is correct on the final hex as well
              console.log("Big stone LERPed Y (final hex):", bigStoneSpriteRef.current.position.y);
              const finalHexYRaycaster = new THREE.Raycaster(
                new THREE.Vector3(
                  bigStoneSpriteRef.current.position.x,
                  bigStoneSpriteRef.current.position.y + 2.0, // Modified Y origin
                  bigStoneSpriteRef.current.position.z
                ),
                new THREE.Vector3(0, -1, 0)
              );
              const finalTerrainIntersects = finalHexYRaycaster.intersectObjects(interactiveMeshesRef.current, false);
              if (finalTerrainIntersects.length > 0) {
                const targetY = finalTerrainIntersects[0].point.y + 0.8;
                bigStoneSpriteRef.current.position.y = THREE.MathUtils.lerp(
                    bigStoneSpriteRef.current.position.y,
                    targetY,
                    yPositionSmoothingFactor
                );
                console.log("Big stone raycast hit (final hex). Smoothed New Y:", bigStoneSpriteRef.current.position.y);
              } else {
                // console.warn("Downward raycast for Y-positioning (FINAL HEX) missed terrain at XZ:", bigStoneSpriteRef.current.position.x, bigStoneSpriteRef.current.position.z);
              }
              if (!currentBigStoneHexRef.current || currentBigStoneHexRef.current.worldPosition.x !== bigStonePathRef.current[bigStoneCurrentPathSegmentRef.current].x || currentBigStoneHexRef.current.worldPosition.y !== bigStonePathRef.current[bigStoneCurrentPathSegmentRef.current].z) {
                const lastPathPoint = bigStonePathRef.current[bigStoneCurrentPathSegmentRef.current];
                currentBigStoneHexRef.current = hexagonDataRef.current.find(h => h.worldPosition.x === lastPathPoint.x && h.worldPosition.y === lastPathPoint.z);
              }
              // console.log("Big stone snapped to final destination:", currentBigStoneHexRef.current ? currentBigStoneHexRef.current.id : "Unknown");
              bigStonePathRef.current = [];
              bigStoneHexDataPathRef.current = [];
            }
          }
          renderer.render(sceneRef.current, camera);
          
          statsRef.current.end(); // End FPS/MS monitoring
          animationId = requestAnimationFrame(animate);
        }
        console.log("Scene setup complete. Starting animation loop.");
        animate();
      };
      
      onRegularTexturesLoaded();

      // Return the actual cleanup function for useEffect
      return () => {
        console.log("Cleaning up scene...");
        // Now onCanvasClick is in scope for removal, ensure it and renderer.domElement exist
        if (
          renderer &&
          renderer.domElement &&
          typeof onCanvasClick === "function"
        ) {
          renderer.domElement.removeEventListener("click", onCanvasClick);
        }
        if (animationId) cancelAnimationFrame(animationId);
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentElement) {
            renderer.domElement.parentElement.removeChild(renderer.domElement);
          }
        }
        if (pmrem) pmrem.dispose();
        // Geometries and materials will be garbage collected if not referenced elsewhere
      };
    }

    let cleanupFunction = () => {};
    setupScene()
      .then((returnedCleanup) => {
        if (typeof returnedCleanup === "function") {
          cleanupFunction = returnedCleanup;
        }
      })
      .catch((error) => {
        console.error("Error in setupScene promise chain:", error);
      });

    return () => {
      cleanupFunction();
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  return (
    <div ref={mountRef} style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <button
        onClick={handleMoveToCenterClick}
        style={{ position: "absolute", top: "10px", left: "10px", zIndex: 10 }}
      >
        Move Big Stone to Center
      </button>
    </div>
  );
}

export default App;

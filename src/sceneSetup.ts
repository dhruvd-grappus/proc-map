import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib/controls/OrbitControls';
import { RGBELoader } from 'three-stdlib/loaders/RGBELoader';
import {
  // If using setter functions from globals.ts:
  // setScene, setCamera, setRenderer, setPmrem, setEnvmap, setControls,
  // textures as globalTextures // If storing textures globally
} from './globals';

export function initializeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#FFEECC");
  // if (setScene) setScene(scene); // Optional: if using global setters
  return scene;
}

export function initializeCamera(aspectRatio: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, aspectRatio, 0.1, 1000);
  camera.position.set(-17, 31, 33); // Default position from main.js
  // if (setCamera) setCamera(camera); // Optional
  return camera;
}

export function initializeRenderer(canvasContainer: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight); // Adjust if container has fixed size
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace; // Changed from outputEncoding
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasContainer.appendChild(renderer.domElement);
  // if (setRenderer) setRenderer(renderer); // Optional

  // Handle window resize
  window.addEventListener('resize', () => {
    const camera = (renderer as any).userData.camera as THREE.PerspectiveCamera; // Assuming camera is stored and is PerspectiveCamera
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return renderer;
}

export function initializeLights(scene: THREE.Scene): THREE.PointLight {
  const light = new THREE.PointLight(new THREE.Color("#FFCB8E").convertSRGBToLinear(), 80, 200);
  light.position.set(10, 20, 10);
  light.castShadow = true;
  light.shadow.mapSize.width = 512;
  light.shadow.mapSize.height = 512;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 500;
  scene.add(light);
  return light; // Return the main light, or an array if more complex
}

export function initializeOrbitControls(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, domElement: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 0, 0);
  controls.dampingFactor = 0.05;
  controls.enableDamping = true;
  // if (setControls) setControls(controls); // Optional
  return controls;
}

export async function loadEnvironmentMap(
  renderer: THREE.WebGLRenderer, // Needed for PMREMGenerator
  path: string
): Promise<THREE.Texture> {
  // PMREMGenerator needs to be created per renderer instance
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const envmapTexture = await new RGBELoader().loadAsync(path);
  const rt = pmremGenerator.fromEquirectangular(envmapTexture);
  pmremGenerator.dispose(); // Dispose of the generator once done
  envmapTexture.dispose(); // Dispose of the loaded texture if not needed directly
  // if (setEnvmap) setEnvmap(rt.texture); // Optional
  // if (setPmrem) // pmrem is more of a utility, maybe not store globally directly
  return rt.texture;
}

export async function loadTextures(texturePaths: { [key: string]: string }): Promise<{ [key: string]: THREE.Texture }> {
  const textureLoader = new THREE.TextureLoader();
  const loadedTextures: { [key: string]: THREE.Texture } = {};
  const promises: Promise<void>[] = [];

  for (const key in texturePaths) {
    promises.push(
      textureLoader.loadAsync(texturePaths[key]).then(texture => {
        loadedTextures[key] = texture;
        // if (globalTextures) globalTextures[key] = texture; // Optional: if storing globally
      })
    );
  }

  await Promise.all(promises);
  return loadedTextures;
}

// Call this function in main.ts to attach camera to renderer for resize
export function setRendererCamera(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    (renderer as any).userData.camera = camera;
}

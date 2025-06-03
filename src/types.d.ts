declare module 'https://cdn.skypack.dev/simplex-noise@3.0.0' {
  export default class SimplexNoise {
    constructor(seed?: string | number);
    noise2D(x: number, y: number): number;
    noise3D(x: number, y: number, z: number): number;
    noise4D(x: number, y: number, z: number, w: number): number;
  }
}

declare module 'stats.js' {
  export default class Stats {
    dom: HTMLDivElement;
    showPanel(panel: number): void;
    begin(): void;
    end(): void;
    update(): void;
  }
}

// Define interfaces for THREE and CANNON if not resolved globally, though typically they are
// This is more of a fallback or for ensuring specific versions/structures if needed.
// However, for this conversion, we'll assume 'three' and 'cannon-es' types are mostly picked up.

// Custom types for the application
interface HexData {
  tileX: number;
  tileY: number;
  worldPos: THREE.Vector2; // Assuming THREE.Vector2 is available
  baseHeight: number;
  materialType: string;
  perGroupInstanceId?: number;
  instanceId?: number; // Used in liftedHexInfo
  originalMatrix?: THREE.Matrix4; // Used in liftedHexInfo
  liftStartTime?: number; // Used in liftedHexInfo
  yOffset?: number; // Used in liftedHexInfo, though not in original hexDataMap values
  mesh?: THREE.Mesh; // Optional, as not all hexData entries might have a direct mesh reference in the map.
  // Cannon body reference was removed previously: body?: CANNON.Body;
}

interface AStarNode extends HexData {
  gCost: number;
  hCost: number;
  fCost: number;
  parent: AStarNode | null;
}

interface GroupedInstance {
  matrix: THREE.Matrix4;
  tileX: number;
  tileY: number;
  worldPos: THREE.Vector2; // THREE.Vector2
  baseHeight: number;
  perGroupInstanceId: number;
}

interface GroupedInstanceData {
  [materialType: string]: GroupedInstance[];
}

interface Textures {
  dirt: THREE.Texture;
  dirt2: THREE.Texture;
  grass: THREE.Texture[]; // Array of textures for grass
  grassNormal: THREE.Texture;
  sand: THREE.Texture;
  water: THREE.Texture;
  stone: THREE.Texture;
  [key: string]: THREE.Texture | THREE.Texture[]; // Index signature for dynamic access
}

interface LoadedHexTile {
  coord: string;
  terrain: string;
  elevation: number;
}

interface LoadedMapData {
  hex_data: LoadedHexTile[];
}

interface LiftedHexInfo {
  instancedMesh: THREE.InstancedMesh;
  instanceId: number;
  originalMatrix: THREE.Matrix4;
  liftStartTime: number;
  yOffset: number; // This was part of the runtime calculation, might be better to keep it transient
}

// Global augmentation if needed for window properties, but Stats.js is a module import.
// interface Window {
//   Stats?: typeof Stats;
// }

// Make THREE and CANNON available globally for the sake of existing non-module JS code style
// This isn't strictly necessary if all usage is within this module and imports are used correctly.
// However, the original code uses `THREE` and `CANNON` as if they are global.
// For a TS module, direct imports are preferred.
// declare global {
// const THREE: typeof import('three');
// const CANNON: typeof import('cannon-es');
// }
// The above declare global is problematic with ES module imports from CDN.
// Better to ensure imports are used directly.

// The skypack URLs will be treated as module specifiers.
// For three-stdlib, specific paths might need their own declarations if not covered by a broader @types/three or similar.
declare module 'https://cdn.skypack.dev/three-stdlib@2.8.5/controls/OrbitControls' {
  export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
}

declare module 'https://cdn.skypack.dev/three-stdlib@2.8.5/loaders/RGBELoader' {
  export { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
}

declare module 'https://cdn.skypack.dev/three-stdlib@2.8.5/utils/BufferGeometryUtils' {
  export { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';
}
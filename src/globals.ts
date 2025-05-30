import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three-stdlib/controls/OrbitControls';
import Stats from 'stats.js';

// Constants
export const MAX_HEIGHT = 10;
export const TILE_X_RANGE = 100;
export const TILE_Y_RANGE = 100;
export const HEX_LIFT_AMOUNT = 0.5;
export const HEX_LIFT_DURATION = 150; // ms
export const JUMP_FORCE = 30;
export const SPHERE_ANIMATION_DURATION = 300; // ms
export const NUM_ADDITIONAL_SPHERES = 4;
export const SURFACE_HEIGHT = 3; // Default surface height for some hexes

// Height thresholds for different hex types
export const STONE_HEIGHT_THRESHOLD = MAX_HEIGHT * 0.8;
export const DIRT_HEIGHT_THRESHOLD = MAX_HEIGHT * 0.7;
export const GRASS_HEIGHT_THRESHOLD = MAX_HEIGHT * 0.5;
export const SAND_HEIGHT_THRESHOLD = MAX_HEIGHT * 0.3;
export const DIRT2_HEIGHT_THRESHOLD = MAX_HEIGHT * 0.15;

// Shared Three.js and Cannon.js instances
// These will be initialized and assigned in the main setup.
// Using '!' as a definite assignment assertion, assuming they will be initialized before use.
export let scene: THREE.Scene;
export let world: CANNON.World;
export let camera: THREE.PerspectiveCamera;
export let renderer: THREE.WebGLRenderer;
export let pmrem: THREE.PMREMGenerator;
export let envmap: THREE.Texture; // Environment map texture
export let controls: OrbitControls;
export let stats: Stats;

// Function to set the shared instances
export function setScene(s: THREE.Scene) { scene = s; }
export function setWorld(w: CANNON.World) { world = w; }
export function setCamera(c: THREE.PerspectiveCamera) { camera = c; }
export function setRenderer(r: THREE.WebGLRenderer) { renderer = r; }
export function setPmrem(p: THREE.PMREMGenerator) { pmrem = p; }
export function setEnvmap(e: THREE.Texture) { envmap = e; }
export function setControls(o: OrbitControls) { controls = o; }
export function setStats(s: Stats) { stats = s; }


// Data structures and types (can be expanded)
export interface HexData {
  tileX: number;
  tileY: number;
  worldPos: THREE.Vector2; // Using THREE.Vector2 for simplicity, mapping to x, z
  baseHeight: number;
  materialType: string;
  perGroupInstanceId: number; // Instance ID within its material group
  // mesh?: THREE.Mesh; // Optional: if individual meshes were still used
  // body?: CANNON.Body; // Optional: if individual bodies were still used
}

export type HexDataMap = Map<string, HexData>; // Key: "x,y"
export const hexDataMap: HexDataMap = new Map<string, HexData>();

export const textures: { [key: string]: THREE.Texture } = {};
export const instancedMeshes: { [key: string]: THREE.InstancedMesh } = {}; // Store InstancedMesh objects by type
export const allHexMeshes: THREE.InstancedMesh[] = []; // To store all instanced meshes for raycasting

// Helper for managing Object3D for instancing
export const dummy = new THREE.Object3D();

// Mouse interaction state
export const mouse = new THREE.Vector2();
export let isRightMouseDown = false;

export function setRightMouseDown(value: boolean) {
    isRightMouseDown = value;
}

// Raycasting
export const threeRaycaster = new THREE.Raycaster();


// Animation States
export interface HexLiftAnimationState {
  isLifting: boolean;
  liftedHexInfo: {
    instancedMesh: THREE.InstancedMesh;
    instanceId: number;
    originalMatrix: THREE.Matrix4;
    liftStartTime: number;
    yOffset: number; // Current yOffset, might not be strictly needed if calculated on the fly
  } | null;
}

export interface SphereAnimationState {
  isAnimating: boolean;
  animationStartTime: number;
  startPos: CANNON.Vec3;
  targetPos: CANNON.Vec3;
  currentPath: PathNode[];
  currentPathIndex: number;
}

export interface PathNode {
  tileX: number;
  tileY: number;
  worldPos: THREE.Vector2; // x, z in world
  baseHeight: number;
}

// Initialize animation states
export const hexLiftAnimationState: HexLiftAnimationState = {
  isLifting: false,
  liftedHexInfo: null,
};

export const sphereAnimationState: SphereAnimationState = {
  isAnimating: false,
  animationStartTime: 0,
  startPos: new CANNON.Vec3(),
  targetPos: new CANNON.Vec3(),
  currentPath: [],
  currentPathIndex: 0,
};

// Physics related
export let lastCallTime: number | undefined;
export const timeStep = 1 / 60; // seconds
export const defaultMaterial = new CANNON.Material("default");

export function setLastCallTime(time: number | undefined) {
    lastCallTime = time;
}

// Make sure to initialize these in your main setup
export const physicalBodies: CANNON.Body[] = [];
export const visualMeshes: THREE.Mesh[] = [];


// Add more as needed

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  scene as globalScene, // Use if scene is globally managed
  world as globalWorld, // Use if world is globally managed
  envmap as globalEnvmap,
  HexDataMap,
  PathNode, // For pathfinding results
  JUMP_FORCE,
  MAX_HEIGHT, // Used for initial spawn Y
  SURFACE_HEIGHT, // Used for AI sphere clamping
  defaultMaterial, // from globals
  sphereAnimationState, // from globals
} from './globals';
import { createSpherePhysicsBody } from './physics';
// import { aStarPathfinding, getHexNode } from './pathfinding'; // Will be used later

// Temporary stand-in for PathNode until pathfinding.ts is created
// interface PathNode { tileX: number; tileY: number; worldPos: THREE.Vector2; baseHeight: number; }


export function createSphereMesh(
  radius: number,
  color: THREE.ColorRepresentation,
  currentEnvmap: THREE.Texture,
  sceneInstance: THREE.Scene // Explicit scene instance
): THREE.Mesh {
  const sphereGeometry = new THREE.SphereGeometry(radius);
  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: color,
    envMap: currentEnvmap,
  });
  const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphereMesh.castShadow = true;
  sphereMesh.receiveShadow = true;
  sceneInstance.add(sphereMesh);
  return sphereMesh;
}

export function createPlayerSphere(
  sceneInstance: THREE.Scene,
  worldInstance: CANNON.World,
  currentEnvmap: THREE.Texture,
  initialPosition: CANNON.Vec3 // Expect initial position to be calculated and passed
): { body: CANNON.Body; mesh: THREE.Mesh } {
  const radius = 1; // m, as in original
  const mass = 5; // kg

  const sphereBody = createSpherePhysicsBody(radius, initialPosition, mass, defaultMaterial);
  worldInstance.addBody(sphereBody);

  const sphereMesh = createSphereMesh(radius, 0xff0000, currentEnvmap, sceneInstance);
  sphereMesh.position.copy(sphereBody.position as unknown as THREE.Vector3); // Initial sync

  return { body: sphereBody, mesh: sphereMesh };
}

export function createAdditionalSpheres(
  count: number,
  radius: number,
  sceneInstance: THREE.Scene,
  worldInstance: CANNON.World,
  currentEnvmap: THREE.Texture,
  hexDataMap: HexDataMap // Needed for getSphereCurrentHexCoords and ensuring valid spawn
): Array<{ body: CANNON.Body; mesh: THREE.Mesh }> {
  const spheres = [];
  const mass = 5; // kg

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const xOffset = Math.cos(angle) * 4; // 4 units away
    const zOffset = Math.sin(angle) * 4;
    // Ensure y is above terrain. MAX_HEIGHT + radius is a safe bet, or use raycasting.
    const initialY = Math.max(MAX_HEIGHT + radius + 0.2, SURFACE_HEIGHT);
    const initialPosition = new CANNON.Vec3(xOffset, initialY, zOffset);

    const body = createSpherePhysicsBody(radius, initialPosition, mass, defaultMaterial);
    worldInstance.addBody(body);

    const mesh = createSphereMesh(radius, Math.random() * 0xffffff, currentEnvmap, sceneInstance);
    mesh.position.copy(body.position as unknown as THREE.Vector3); // Initial sync
    spheres.push({ body, mesh });
  }
  return spheres;
}

// This function is crucial for linking sphere's 3D position to the hex grid
export function getSphereCurrentHexCoords(
  sphereBodyPos: CANNON.Vec3, // CANNON.Vec3 for physics body position
  hexDataMap: HexDataMap
): { tileX: number; tileY: number } | null {
  let closestHex: { tileX: number; tileY: number } | null = null;
  let minDistanceSq = Infinity;

  // Assuming hexDataMap stores worldPos as THREE.Vector2 (x, z)
  for (const [, hexData] of hexDataMap) {
    const dx = sphereBodyPos.x - hexData.worldPos.x;
    const dz = sphereBodyPos.z - hexData.worldPos.y; // hexData.worldPos.y is the 'z' for the grid
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq < minDistanceSq) {
      minDistanceSq = distanceSq;
      // Consider a hex "occupied" if the sphere is within a certain radius of its center.
      // The hex radius is approx 1.
      if (distanceSq < 1 * 1) { // Check if within the hex's area
         closestHex = { tileX: hexData.tileX, tileY: hexData.tileY };
      }
    }
  }
   // If after checking all, minDistanceSq is still very large, it means we are not "on" any hex.
   // This can happen if the previous check (distanceSq < 1*1) was too strict or sphere is outside map.
   // For now, let's stick to the stricter check. If no hex is close enough, return null.
  return closestHex;
}


export function updateAISpheres(
  additionalSpheres: Array<{ body: CANNON.Body; mesh: THREE.Mesh }>,
  hexDataMap: HexDataMap, // To get hex node for y-clamping
  // world: CANNON.World, // world might be needed if AI interacts more deeply
  sphereRadius: number,
  currentSurfaceHeight: number // Global surface height
): void {
  const RANDOM_MOVEMENT_PROBABILITY = 0.005;
  const RANDOM_IMPULSE_STRENGTH = 5;

  for (const sphere of additionalSpheres) {
    sphere.mesh.position.copy(sphere.body.position as unknown as THREE.Vector3);
    sphere.mesh.quaternion.copy(sphere.body.quaternion as unknown as THREE.Quaternion);

    // Clamp AI sphere visual y to at least surfaceHeight and top of hex it is over
    const sphereHexCoords = getSphereCurrentHexCoords(sphere.body.position, hexDataMap);
    let currentHexBaseHeight = currentSurfaceHeight; // Default to surface height
    if (sphereHexCoords) {
        const hexKey = `${sphereHexCoords.tileX},${sphereHexCoords.tileY}`;
        const hexNode = hexDataMap.get(hexKey);
        if (hexNode) {
            currentHexBaseHeight = hexNode.baseHeight;
        }
    }
    const
topY = Math.max(currentSurfaceHeight, currentHexBaseHeight + sphereRadius);
    if (sphere.mesh.position.y < topY) {
      sphere.mesh.position.y = topY;
    }
     if (sphere.body.position.y < (currentHexBaseHeight + sphereRadius - 0.1) ) { // Physics body also needs clamping
        sphere.body.position.y = currentHexBaseHeight + sphereRadius;
        sphere.body.velocity.y = Math.max(0, sphere.body.velocity.y); // Stop downward motion if clamped
    }


    if (Math.random() < RANDOM_MOVEMENT_PROBABILITY) {
      const randomForce = new CANNON.Vec3(
        (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH,
        Math.random() * RANDOM_IMPULSE_STRENGTH * 0.2, // Small upward impulse
        (Math.random() - 0.5) * 2 * RANDOM_IMPULSE_STRENGTH
      );
      sphere.body.applyImpulse(randomForce, sphere.body.position);
      if (sphere.body.sleepState === CANNON.Body.SLEEPING) {
        sphere.body.wakeUp();
      }
    }
  }
}

export function handleSphereJump(sphereBody: CANNON.Body, worldInstance: CANNON.World): void {
  // Check if sphere is on the ground before jumping
  const spherePos = sphereBody.position;
  const sphereRadius = (sphereBody.shapes[0] as CANNON.Sphere).radius;
  const rayFrom = new CANNON.Vec3(spherePos.x, spherePos.y, spherePos.z);
  const rayTo = new CANNON.Vec3(spherePos.x, spherePos.y - sphereRadius - 0.1, spherePos.z);
  const result = new CANNON.RaycastResult();

  // Raycast against everything that has collision response
  worldInstance.raycastClosest(rayFrom, rayTo, { checkCollisionResponse: true }, result);

  if (result.hasHit && result.body !== sphereBody) {
    sphereBody.applyImpulse(new CANNON.Vec3(0, JUMP_FORCE, 0), sphereBody.position);
    if (sphereBody.sleepState === CANNON.Body.SLEEPING) {
      sphereBody.wakeUp();
    }
  }
}

// More functions will be added for path following initiation, animation updates related to spheres, etc.
// These will likely interact with animation.ts and eventHandling.ts

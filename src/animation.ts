import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  hexLiftAnimationState,
  sphereAnimationState,
  HexLiftAnimationState, // Import type if not already
  SphereAnimationState, // Import type if not already
  PathNode,
  MAX_HEIGHT,
  SURFACE_HEIGHT, // Used for clamping
  HEX_LIFT_AMOUNT,
  HEX_LIFT_DURATION,
  SPHERE_ANIMATION_DURATION,
  HexDataMap, // For sphere Y clamping over hexes
} from './globals';
// import { getHexNode } from './pathfinding'; // May not be needed if path has all data

export function startHexLiftAnimation(
  targetInstancedMesh: THREE.InstancedMesh,
  instanceId: number
): void {
  if (hexLiftAnimationState.isLifting) return;

  const originalMatrix = new THREE.Matrix4();
  targetInstancedMesh.getMatrixAt(instanceId, originalMatrix);

  hexLiftAnimationState.isLifting = true;
  hexLiftAnimationState.liftedHexInfo = {
    instancedMesh: targetInstancedMesh,
    instanceId: instanceId,
    originalMatrix: originalMatrix,
    liftStartTime: performance.now(),
    yOffset: 0,
  };
}

export function startSphereMoveAnimation(
  sphereBody: CANNON.Body,
  path: PathNode[],
  world: CANNON.World // For raycasting
): void {
  if (path.length === 0 || sphereAnimationState.isAnimating) return;

  sphereAnimationState.currentPath = path;
  sphereAnimationState.currentPathIndex = 0;
  const firstStepNode = sphereAnimationState.currentPath[0];

  sphereAnimationState.startPos.copy(sphereBody.position);

  const sphereRadius = (sphereBody.shapes[0] as CANNON.Sphere).radius;
  const targetHexWorldPos = firstStepNode.worldPos; // THREE.Vector2 (x, z)

  const rayFromCannon = new CANNON.Vec3(targetHexWorldPos.x, MAX_HEIGHT + sphereRadius + 5, targetHexWorldPos.y);
  const rayToCannon = new CANNON.Vec3(targetHexWorldPos.x, -MAX_HEIGHT, targetHexWorldPos.y);
  const result = new CANNON.RaycastResult();
  world.raycastClosest(rayFromCannon, rayToCannon, { checkCollisionResponse: false }, result);

  let targetY = firstStepNode.baseHeight + sphereRadius + 0.075; // Default
  if (result.hasHit) {
    targetY = result.hitPointWorld.y + sphereRadius + 0.075;
  }

  sphereAnimationState.targetPos.set(firstStepNode.worldPos.x, targetY, firstStepNode.worldPos.y);
  sphereAnimationState.isAnimating = true;
  sphereAnimationState.animationStartTime = performance.now();
}

export function updateAnimations(
    sphereBody: CANNON.Body, // Player's sphere
    world: CANNON.World, // For raycasting next sphere steps
    // hexDataMap: HexDataMap, // For clamping sphere visual Y, if needed here
    // playerSphereRadius: number // For clamping sphere visual Y
): void {
  const currentTimeMs = performance.now();

  // Hex lift animation logic
  if (hexLiftAnimationState.isLifting && hexLiftAnimationState.liftedHexInfo) {
    const { instancedMesh, instanceId, originalMatrix, liftStartTime } = hexLiftAnimationState.liftedHexInfo;
    const elapsedTime = currentTimeMs - liftStartTime;
    let liftProgress = elapsedTime / HEX_LIFT_DURATION;
    let currentYOffset: number;

    const tempMatrix = new THREE.Matrix4(); // To avoid modifying originalMatrix directly in calculations
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    originalMatrix.decompose(position, quaternion, scale);

    if (liftProgress <= 1) { // Lifting up phase
      currentYOffset = HEX_LIFT_AMOUNT * liftProgress;
    } else if (liftProgress <= 2) { // Moving down phase
      currentYOffset = HEX_LIFT_AMOUNT * (1 - (liftProgress - 1));
    } else { // Animation finished
      currentYOffset = 0; // Ensure it's exactly 0
      hexLiftAnimationState.isLifting = false;
      instancedMesh.setMatrixAt(instanceId, originalMatrix); // Restore original
      instancedMesh.instanceMatrix.needsUpdate = true;
      hexLiftAnimationState.liftedHexInfo = null;
      // console.log("Hex restore complete");
    }

    if (hexLiftAnimationState.liftedHexInfo) { // Check if not nullified
      // Apply offset to the original decomposed position's Y
      const liftedPosition = new THREE.Vector3(position.x, position.y + currentYOffset, position.z);
      tempMatrix.compose(liftedPosition, quaternion, scale);
      instancedMesh.setMatrixAt(instanceId, tempMatrix);
      instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Sphere movement animation logic
  if (sphereAnimationState.isAnimating) {
    const elapsedTime = currentTimeMs - sphereAnimationState.animationStartTime;
    let progress = elapsedTime / SPHERE_ANIMATION_DURATION;

    if (progress >= 1) {
      progress = 1; // Clamp progress
      // Move to target precisely
      sphereBody.position.copy(sphereAnimationState.targetPos);
      sphereBody.velocity.set(0, 0, 0);
      sphereBody.angularVelocity.set(0, 0, 0);

      sphereAnimationState.currentPathIndex++;
      if (sphereAnimationState.currentPath.length > 0 && sphereAnimationState.currentPathIndex < sphereAnimationState.currentPath.length) {
        const nextStepNode = sphereAnimationState.currentPath[sphereAnimationState.currentPathIndex];
        sphereAnimationState.startPos.copy(sphereBody.position); // New start is current position

        const sphereRadius = (sphereBody.shapes[0] as CANNON.Sphere).radius;
        const nextHexWorldPos = nextStepNode.worldPos;

        const rayFromNext = new CANNON.Vec3(nextHexWorldPos.x, MAX_HEIGHT + sphereRadius + 5, nextHexWorldPos.y);
        const rayToNext = new CANNON.Vec3(nextHexWorldPos.x, -MAX_HEIGHT, nextHexWorldPos.y);
        const resultNext = new CANNON.RaycastResult();
        world.raycastClosest(rayFromNext, rayToNext, { checkCollisionResponse: false }, resultNext);

        let nextTargetY = nextStepNode.baseHeight + sphereRadius + 0.075; // Default
        if (resultNext.hasHit) {
          nextTargetY = resultNext.hitPointWorld.y + sphereRadius + 0.075;
        }

        sphereAnimationState.targetPos.set(nextStepNode.worldPos.x, nextTargetY, nextStepNode.worldPos.y);
        sphereAnimationState.animationStartTime = currentTimeMs; // Reset start time for new segment
      } else {
        // console.log("Full A* path traversed.");
        sphereAnimationState.isAnimating = false;
        sphereAnimationState.currentPath = [];
        sphereAnimationState.currentPathIndex = 0;
      }
    } else {
      // Interpolate position
      const newX = sphereAnimationState.startPos.x + (sphereAnimationState.targetPos.x - sphereAnimationState.startPos.x) * progress;
      let newY = sphereAnimationState.startPos.y + (sphereAnimationState.targetPos.y - sphereAnimationState.startPos.y) * progress;
      newY = Math.max(newY, SURFACE_HEIGHT); // Prevent going below a minimum surface height during animation
      const newZ = sphereAnimationState.startPos.z + (sphereAnimationState.targetPos.z - sphereAnimationState.startPos.z) * progress;
      sphereBody.position.set(newX, newY, newZ);
      // Keep sphere kinematic during animation
      sphereBody.velocity.set(0, 0, 0);
      sphereBody.angularVelocity.set(0, 0, 0);
    }
  }
}

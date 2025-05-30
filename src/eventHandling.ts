import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  mouse, // from globals
  threeRaycaster, // from globals
  HexDataMap,
  HexData,
  instancedMeshes as globalInstancedMeshes, // assuming global for now
  allHexMeshes as globalAllHexMeshes, // assuming global for now
  sphereAnimationState,
  hexLiftAnimationState,
  setRightMouseDown,
  isRightMouseDown as getIsRightMouseDown, // getter for state
  MAX_HEIGHT,
  PathNode,
  setLastCallTime, // If animations reset it
  world as globalWorld, // assuming global
  scene as globalScene // assuming global
} from './globals';
import { handleSphereJump, getSphereCurrentHexCoords } from './sphereControls';
import { aStarPathfinding, getHexNode } from './pathfinding'; // getHexNode might be useful

// Placeholder for animation control functions until animation.ts is made
function startHexLift(
    targetInstancedMesh: THREE.InstancedMesh,
    perGroupInstanceId: number,
    // originalMatrix: THREE.Matrix4 // Matrix is fetched inside if this is how we design it
): void {
    if (hexLiftAnimationState.isLifting) return; // Already lifting

    const originalMatrix = new THREE.Matrix4();
    targetInstancedMesh.getMatrixAt(perGroupInstanceId, originalMatrix);

    hexLiftAnimationState.isLifting = true;
    hexLiftAnimationState.liftedHexInfo = {
        instancedMesh: targetInstancedMesh,
        instanceId: perGroupInstanceId,
        originalMatrix: originalMatrix,
        liftStartTime: performance.now(),
        yOffset: 0, // Initial yOffset
    };
    // console.log("Hex lift started for instance:", perGroupInstanceId, "on mesh:", targetInstancedMesh.uuid);
}

function startSphereMove(
    sphereBody: CANNON.Body,
    path: PathNode[],
    worldForRaycast: CANNON.World, // Pass world for raycasting
): void {
    if (path.length === 0) return;

    sphereAnimationState.currentPath = path;
    sphereAnimationState.currentPathIndex = 0;
    const firstStepNode = sphereAnimationState.currentPath[0];

    sphereAnimationState.startPos.copy(sphereBody.position);

    const sphereRadius = (sphereBody.shapes[0] as CANNON.Sphere).radius;
    const targetHexWorldPos = firstStepNode.worldPos; // This is a THREE.Vector2 (x, z)

    // Raycast to find the actual landing Y position on the target hex
    const rayFromCannonForLanding = new CANNON.Vec3(targetHexWorldPos.x, MAX_HEIGHT + sphereRadius + 5, targetHexWorldPos.y);
    const rayToCannonForLanding = new CANNON.Vec3(targetHexWorldPos.x, -MAX_HEIGHT, targetHexWorldPos.y);
    const cannonResultForLanding = new CANNON.RaycastResult();
    worldForRaycast.raycastClosest(rayFromCannonForLanding, rayToCannonForLanding, { checkCollisionResponse: false }, cannonResultForLanding);

    let targetY = firstStepNode.baseHeight + sphereRadius + 0.075; // Default target Y
    if (cannonResultForLanding.hasHit) {
        targetY = cannonResultForLanding.hitPointWorld.y + sphereRadius + 0.075; // Adjusted Y based on hit
    }

    sphereAnimationState.targetPos.set(firstStepNode.worldPos.x, targetY, firstStepNode.worldPos.y);
    sphereAnimationState.isAnimating = true;
    sphereAnimationState.animationStartTime = performance.now();
    // console.log("Sphere move started to:", firstStepNode);
}


function getClickedHexData(
    intersection: THREE.Intersection,
    hexDataMap: HexDataMap
): HexData | null {
    if (intersection.object instanceof THREE.InstancedMesh && intersection.instanceId !== undefined) {
        const hitInstancedMesh = intersection.object as THREE.InstancedMesh;
        const clickedInstanceId = intersection.instanceId;
        const materialType = hitInstancedMesh.userData.materialType as string;

        // Find the corresponding HexData
        // This requires hexDataMap to store materialType and perGroupInstanceId
        for (const [, data] of hexDataMap) {
            if (data.materialType === materialType && data.perGroupInstanceId === clickedInstanceId) {
                return data;
            }
        }
    }
    return null;
}

export function setupMouseInteraction(
    camera: THREE.Camera,
    rendererDomElement: HTMLElement,
    // Pass necessary state if not using globals directly
    // For example:
    currentHexDataMap: HexDataMap,
    currentInstancedMeshes: { [key: string]: THREE.InstancedMesh }, // Used by getClickedHexData logic
    currentAllHexMeshes: THREE.InstancedMesh[], // Used for raycasting
    sphereBody: CANNON.Body,
    worldInstance: CANNON.World, // Explicitly pass world
    // sceneInstance: THREE.Scene // Pass scene if needed for e.g. visual cues
) {
    const onMouseDown = (event: MouseEvent) => {
        event.preventDefault();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        threeRaycaster.setFromCamera(mouse, camera);

        if (event.button === 0) { // Left mouse button
            const intersects = threeRaycaster.intersectObjects(currentAllHexMeshes, false); // Use passed state

            if (intersects.length > 0) {
                const finalClickedHexData = getClickedHexData(intersects[0], currentHexDataMap);

                if (finalClickedHexData && !hexLiftAnimationState.isLifting && !sphereAnimationState.isAnimating) {
                    const { materialType, perGroupInstanceId, worldPos, baseHeight, tileX, tileY } = finalClickedHexData;
                    const targetInstancedMesh = currentInstancedMeshes[materialType];

                    if (targetInstancedMesh && perGroupInstanceId !== undefined) {
                        const sphereCurrentHex = getSphereCurrentHexCoords(sphereBody.position, currentHexDataMap);
                        let allowHexLift = true;
                        if (sphereCurrentHex && sphereCurrentHex.tileX === tileX && sphereCurrentHex.tileY === tileY) {
                            allowHexLift = false; // Don't lift the hex the sphere is on
                        }

                        if (allowHexLift) {
                            startHexLift(targetInstancedMesh, perGroupInstanceId);
                        }

                        const startHexCoords = getSphereCurrentHexCoords(sphereBody.position, currentHexDataMap);
                        const targetHexCoords = { tileX, tileY };

                        if (startHexCoords) {
                            const path = aStarPathfinding(startHexCoords, targetHexCoords, currentHexDataMap);
                            if (path.length > 0) {
                                startSphereMove(sphereBody, path, worldInstance);
                            }
                        }
                    }
                } else if (finalClickedHexData) {
                    // console.log("Hex identified, but sphere/hex is already animating.");
                }
            }
        } else if (event.button === 2) { // Right mouse button
            if (!getIsRightMouseDown) { // Check state before setting (getIsRightMouseDown is the boolean value)
                 setRightMouseDown(true);
                 handleSphereJump(sphereBody, worldInstance); // Pass worldInstance
            }
        }
    };

    const onMouseUp = (event: MouseEvent) => {
        if (event.button === 2) { // Right mouse button released
            setRightMouseDown(false);
        }
    };

    rendererDomElement.addEventListener('mousedown', onMouseDown, false);
    rendererDomElement.addEventListener('mouseup', onMouseUp, false);
    rendererDomElement.addEventListener('contextmenu', (event) => event.preventDefault());
}

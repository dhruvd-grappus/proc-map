// animation.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { AnimationState } from './types/index';

export interface SphereAnimationState {
    isAnimating: boolean;
    startTime: number;
    startPos: CANNON.Vec3;
    targetPos: CANNON.Vec3;
    currentPath: any[];
    currentPathIndex: number;
}

export function updateHexLiftAnimation(currentTimeMs: number, animationState: AnimationState, mapInstancedMeshes: { [key: string]: THREE.InstancedMesh }) {
    if (!animationState.isHexLifting || !animationState.liftedHexInfo) return;

    const { hexData, startTime, originalY } = animationState.liftedHexInfo;
    const elapsed = currentTimeMs - startTime;
    const duration = 1000; // 1 second animation

    if (elapsed >= duration) {
        // Animation complete
        animationState.isHexLifting = false;
        animationState.liftedHexInfo = null;
        return;
    }

    const progress = elapsed / duration;
    const targetY = originalY + 2; // Lift height
    const currentY = originalY + (targetY - originalY) * Math.sin(progress * Math.PI);

    // Update hex mesh position
    const mesh = mapInstancedMeshes[hexData.materialType];
    if (mesh) {
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(hexData.perGroupInstanceId, matrix);
        matrix.setPosition(hexData.worldPos.x, currentY, hexData.worldPos.y);
        mesh.setMatrixAt(hexData.perGroupInstanceId, matrix);
        mesh.instanceMatrix.needsUpdate = true;
    }
}

export function updateSpherePathAnimation(sphereAnim: SphereAnimationState, sphereBody: CANNON.Body) {
    if (!sphereAnim.isAnimating || sphereAnim.currentPathIndex >= sphereAnim.currentPath.length) {
        sphereAnim.isAnimating = false;
        return;
    }

    const currentTime = performance.now();
    const elapsed = currentTime - sphereAnim.startTime;
    const duration = 1000; // 1 second per path segment

    if (elapsed >= duration) {
        // Move to next path segment
        sphereAnim.currentPathIndex++;
        if (sphereAnim.currentPathIndex >= sphereAnim.currentPath.length) {
            sphereAnim.isAnimating = false;
            return;
        }
        sphereAnim.startTime = currentTime;
        sphereAnim.startPos = sphereBody.position.clone();
    }

    const currentHex = sphereAnim.currentPath[sphereAnim.currentPathIndex];
    const nextHex = sphereAnim.currentPath[sphereAnim.currentPathIndex + 1];
    
    if (nextHex) {
        const progress = elapsed / duration;
        const startPos = new THREE.Vector3(
            currentHex.worldPos.x,
            currentHex.baseHeight + 1,
            currentHex.worldPos.y
        );
        const endPos = new THREE.Vector3(
            nextHex.worldPos.x,
            nextHex.baseHeight + 1,
            nextHex.worldPos.y
        );

        // Interpolate position
        sphereBody.position.x = startPos.x + (endPos.x - startPos.x) * progress;
        sphereBody.position.y = startPos.y + (endPos.y - startPos.y) * progress;
        sphereBody.position.z = startPos.z + (endPos.z - startPos.z) * progress;
    }
}

export function startHexLift(hexData: any, animationState: AnimationState) {
    animationState.isHexLifting = true;
    animationState.liftedHexInfo = {
        hexData,
        startTime: performance.now(),
        originalY: hexData.baseHeight
    };
}

export function startSpherePath(path: any[], sphereBody: CANNON.Body, sphereAnim: SphereAnimationState) {
    sphereAnim.isAnimating = true;
    sphereAnim.startTime = performance.now();
    sphereAnim.startPos = sphereBody.position.clone();
    sphereAnim.currentPath = path;
    sphereAnim.currentPathIndex = 0;
}
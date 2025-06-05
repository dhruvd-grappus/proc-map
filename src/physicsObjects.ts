// physicsObjects.ts
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { MAX_HEIGHT, NUM_ADDITIONAL_SPHERES } from './config.ts';

export interface Sphere {
    body: CANNON.Body;
    mesh: THREE.Mesh;
    isPlayer: boolean;
}

export function createSpheres(
    scene: THREE.Scene,
    world: CANNON.World,
    envmap: THREE.Texture,
    defaultMaterial: CANNON.Material,
    infantryGLB: any
): Sphere[] {
    const sphereRadius = 1;
    const spheres: Sphere[] = [];
    const surfaceHeight = 3;

    // Helper to clone infantry mesh
    function createInfantryMesh(): THREE.Object3D {
        // Find the first mesh in the GLB scene
        const infantryRoot = infantryGLB.scene.clone(true);
        infantryRoot.traverse((child: any) => {
            if (child.isMesh) {
                child.material.metalness = 0;
                child.material.roughness = 0.5; // or lower for more plastic look
                child.material.color.set(0xffffff);
            }
        });
        // Scale and center as needed
        infantryRoot.scale.set(1.2, 1.2, 1.2); // Adjust scale as needed
        return infantryRoot;
    }

    // Main Sphere (now Infantry)
    const sphereBody = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Sphere(sphereRadius),
        material: defaultMaterial,
        type: CANNON.Body.DYNAMIC,
        linearDamping: 0.4,
        angularDamping: 0.4,
        fixedRotation: false,
        collisionResponse: true
    }) as CANNON.Body & {
        ccdSpeedThreshold: number;
        ccdSweptSphereRadius: number;
    };

    sphereBody.ccdSpeedThreshold = 0.2;
    sphereBody.ccdSweptSphereRadius = 0.05;
    sphereBody.sleepSpeedLimit = 0.2;
    sphereBody.sleepTimeLimit = 0.5;
    sphereBody.position.set(0, Math.max(MAX_HEIGHT + sphereRadius + 0.2, surfaceHeight), 0); // Start high
    world.addBody(sphereBody);

    const infantryMesh = createInfantryMesh();
    infantryMesh.position.copy(sphereBody.position as any);
    scene.add(infantryMesh);
    spheres.push({ body: sphereBody, mesh: infantryMesh as any, isPlayer: true });

    // Additional Spheres (now Infantry)
    for (let i = 0; i < NUM_ADDITIONAL_SPHERES; i++) {
        const additionalRadius = sphereRadius; // Same radius for now
        const body = new CANNON.Body({
            mass: 5,
            shape: new CANNON.Sphere(sphereRadius),
            material: defaultMaterial,
            type: CANNON.Body.DYNAMIC,
            angularDamping: 0.8,
            linearDamping: 0.5,
            collisionResponse: false
        }) as CANNON.Body & {
            ccdSpeedThreshold: number;
            ccdSweptSphereRadius: number;
        };

        body.ccdSpeedThreshold = 0.2;
        body.ccdSweptSphereRadius = 0.05;
        body.sleepSpeedLimit = 0.2;
        body.sleepTimeLimit = 0.5;

        const angle = (i / NUM_ADDITIONAL_SPHERES) * Math.PI * 2;
        const xOffset = Math.cos(angle) * 4;
        const zOffset = Math.sin(angle) * 4;
        body.position.set(xOffset, Math.max(MAX_HEIGHT + additionalRadius + 0.2, surfaceHeight), zOffset);
        world.addBody(body);

        const mesh = createInfantryMesh();
        mesh.position.copy(body.position as any);
        scene.add(mesh);
        spheres.push({ body, mesh: mesh as any, isPlayer: false });
    }

    return spheres;
}

// main.ts
import * as THREE from 'three'; // For Vector3 etc. if needed directly
import * as CANNON from 'cannon-es';
import Stats from 'stats.js';

import { TIME_STEP } from './config.ts';
import { initCore } from './setup.ts';
import { loadAssets } from './assetLoader.ts';
import { createMap, hexDataMap, allHexMeshes, instancedMeshes as mapInstancedMeshes } from './mapGenerator.ts';
import { createSpheres, Sphere } from './physicsObjects.ts';
import { setupMouseControls } from './interaction.ts';
import { updateHexLiftAnimation, updateSpherePathAnimation, startHexLift, startSpherePath } from './animation.ts';
import { worldPointToHex, aStarPathfinding } from './pathfinding.ts';
import { getSocketManager, cleanupSocketManager } from './socketManager.ts';

interface Core {
    scene: THREE.Scene;
    world: CANNON.World;
    camera: THREE.Camera;
    renderer: THREE.WebGLRenderer;
    controls: any;
    pmrem: THREE.PMREMGenerator;
    defaultMaterial: CANNON.Material;
}

interface Assets {
    loadedMapData: any;
    textures: any;
    envmap: THREE.Texture;
}

interface AnimationState {
    isHexLifting: boolean;
    liftedHexInfo: any | null;
    activeSpheres: {
        [sphereId: string]: {
            isAnimating: boolean;
            startTime: number;
            startPos: CANNON.Vec3;
            targetPos: CANNON.Vec3;
            currentPath: any[];
            currentPathIndex: number;
        }
    };
    isSphereAnimating: boolean;
    sphereAnimationStartTime: number;
    sphereAnimationStartPos: CANNON.Vec3;
    sphereAnimationTargetPos: CANNON.Vec3;
    currentPath: any[];
    currentPathIndex: number;
}

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

let core: Core;
let assets: Assets;
let allPhysicalSpheres: Sphere[];
let playerSphere: Sphere | undefined;
let lastCallTime: number;
let socketManager: ReturnType<typeof getSocketManager>;

const animationState: AnimationState = {
    isHexLifting: false,
    liftedHexInfo: null,
    activeSpheres: {},
    isSphereAnimating: false,
    sphereAnimationStartTime: 0,
    sphereAnimationStartPos: new CANNON.Vec3(),
    sphereAnimationTargetPos: new CANNON.Vec3(),
    currentPath: [],
    currentPathIndex: 0
};

function moveSphereToPosition(sphereIndex: number, tileX: number, tileY: number) {
    const sphere = allPhysicalSpheres[sphereIndex];
    if (!sphere) {
        console.warn(`❌ Sphere at index ${sphereIndex} not found`);
        return;
    }

    const targetHexData = hexDataMap.get(`${tileX},${tileY}`);
    if (!targetHexData) {
        console.warn(`❌ No hex found at tile position (${tileX}, ${tileY})`);
        return;
    }

    const sphereCurrentHex = worldPointToHex(
        new THREE.Vector3(sphere.body.position.x, sphere.body.position.y, sphere.body.position.z), 
        hexDataMap
    );

    let allowHexLift: boolean = true;
    if (sphereCurrentHex && sphereCurrentHex.tileX === targetHexData.tileX && sphereCurrentHex.tileY === targetHexData.tileY) {
        allowHexLift = false;
    }

    if (allowHexLift) {
        startHexLift(targetHexData, animationState);
    }

    if (sphereCurrentHex) {
        const targetHexCoords = { tileX: targetHexData.tileX, tileY: targetHexData.tileY };
        const path = aStarPathfinding(sphereCurrentHex, targetHexCoords, hexDataMap);
        if (path.length > 0) {
            console.log(`🛣️ Sphere ${sphere.id} following path:`, path.map(p => `(${p.tileX}, ${p.tileY})`).join(' -> '));
            
            // Initialize animation state for this sphere
            animationState.activeSpheres[sphere.id] = {
                isAnimating: true,
                startTime: performance.now(),
                startPos: sphere.body.position.clone(),
                targetPos: new CANNON.Vec3(),
                currentPath: path,
                currentPathIndex: 0
            };

            // Start the path animation
            startSpherePath(path, sphere.body, animationState.activeSpheres[sphere.id]);

            // Emit sphere movement to other clients
            socketManager.socket?.emit('sphereMove', {
                sphereId: sphere.id,
                targetX: tileX,
                targetY: tileY,
                path: path
            });
        } else {
            console.warn(`⚠️ No path found for sphere ${sphere.id} from (${sphereCurrentHex.tileX}, ${sphereCurrentHex.tileY}) to (${tileX}, ${tileY})`);
        }
    }
}

async function main(): Promise<void> {
    // Initialize socket connection
    socketManager = getSocketManager({
        url: 'http://localhost:3000',
        onMessage: (data) => {
            if (data.type === 'unitUpdates') {
                // Process unit updates
                if (data.updates && Array.isArray(data.updates)) {
                    const colors = [
                        0xff0000, // red
                        0x00ff00, // green
                        0x0000ff, // blue
                        0xffff00, // yellow
                        0xff00ff, // magenta
                        0x00ffff, // cyan
                        0xff8000, // orange
                        0x8000ff, // purple
                        0x008080, // teal
                        0x800080, // violet
                        0xff0080, // pink
                        0x80ff00, // lime
                        0x0080ff, // sky blue
                        0xff8080, // light red
                        0x80ff80, // light green
                        0x8080ff, // light blue
                        0xffff80, // light yellow
                        0xff80ff, // light magenta
                        0x80ffff, // light cyan
                        0xffa500, // dark orange
                        0x4b0082  // indigo
                    ];

                    // Track which spheres we've processed
                    const processedSphereIds = new Set<string>();

                    data.updates.forEach((update: any, index: number) => {
                        const [tileX, tileY] = update.currentHexCoord.split(',').map(Number);
                        const sphereId = update.npcId;
                        processedSphereIds.add(sphereId);

                        // Check if sphere already exists
                        const existingSphere = allPhysicalSpheres.find(s => s.id === sphereId);
                        
                        if (existingSphere) {
                        
                            // Get current hex position
                            const currentHex = worldPointToHex(
                                new THREE.Vector3(
                                    existingSphere.body.position.x,
                                    existingSphere.body.position.y,
                                    existingSphere.body.position.z
                                ),
                                hexDataMap
                            );

                            // If position has changed, move the sphere
                            if (currentHex && (currentHex.tileX !== tileX || currentHex.tileY !== tileY)) {

                                console.log(`🚀 Sphere ${sphereId} moving from (${currentHex.tileX}, ${currentHex.tileY}) to (${tileX}, ${tileY})`);
                                moveSphereToPosition(
                                    allPhysicalSpheres.indexOf(existingSphere),
                                    tileX,
                                    tileY
                                );
                            }
                        } else {
                            // Create new sphere if it doesn't exist
                            const sphereData = {
                                id: sphereId,
                                tileX,
                                tileY,
                                isPlayer: false
                            };

                            const data = createSpheres(
                                core.scene,
                                core.world,
                                assets.envmap,
                                core.defaultMaterial,
                                hexDataMap,
                                sphereData.tileX,
                                sphereData.tileY,
                                colors[index % colors.length],
                                sphereData.id,
                                sphereData.isPlayer
                            );
                            allPhysicalSpheres.push(data[0]);
                        }
                    });

                    // Remove spheres that are no longer in the updates
                    allPhysicalSpheres = allPhysicalSpheres.filter(sphere => {
                        if (!processedSphereIds.has(sphere.id)) {
                            core.scene.remove(sphere.mesh);
                            core.world.removeBody(sphere.body);
                            return false;
                        }
                        return true;
                    });
                }
            }
        }
    });

    // Log socket connection status
    console.log('🔌 Socket Connection Status:', socketManager.connectionStatus);

    // Add socket event listeners for debugging
    socketManager.socket?.on('connect', () => {
        console.log('✅ Socket Connected');
        console.log('🔌 Socket ID:', socketManager.socket?.id);
    });

    socketManager.socket?.on('disconnect', (reason: string) => {
        console.log('❌ Socket Disconnected:', reason);
    });

    socketManager.socket?.on('connect_error', (error: Error) => {
        console.error('⚠️ Socket Connection Error:', error);
    });

    socketManager.socket?.on('reconnect', (attemptNumber: number) => {
        console.log('🔄 Socket Reconnected after', attemptNumber, 'attempts');
    });

    socketManager.socket?.on('reconnect_attempt', (attemptNumber: number) => {
        console.log('🔄 Socket Reconnection Attempt:', attemptNumber);
    });

    socketManager.socket?.on('reconnect_error', (error: Error) => {
        console.error('⚠️ Socket Reconnection Error:', error);
    });

    socketManager.socket?.on('reconnect_failed', () => {
        console.error('❌ Socket Reconnection Failed');
    });

    // Log all emitted events
    const originalEmit = socketManager.socket?.emit;
    if (originalEmit) {
        socketManager.socket.emit = function(event: string, ...args: any[]) {
            console.log('📤 Emitting event:', event, 'with data:', args);
            return originalEmit.apply(this, [event, ...args]);
        };
    }

    core = initCore();
    assets = await loadAssets(core.pmrem);
    (window as any).assets = assets;

    createMap(core.scene, core.world, assets.loadedMapData, assets.textures, assets.envmap, core.defaultMaterial);

    allPhysicalSpheres = [];

    playerSphere = allPhysicalSpheres.find(s => s.isPlayer);

    if (playerSphere) {
        setupMouseControls(core.renderer.domElement, core.camera, core.world, allHexMeshes, hexDataMap, playerSphere, animationState);
    }

    core.renderer.setAnimationLoop(animate);

    // Add cleanup for socket connection
    window.addEventListener('beforeunload', () => {
        cleanupSocketManager();
    });
}

let prevFloorY: number;

function animate(): void {
    stats.begin();
    const time = performance.now() / 1000;
    const currentTimeMs = performance.now();

    const maxSubSteps = 10;
    if (!lastCallTime) {
        core.world.step(TIME_STEP, TIME_STEP, maxSubSteps);
    } else {
        const dt = time - lastCallTime;
        core.world.step(TIME_STEP, dt, maxSubSteps);
    }
    lastCallTime = time;

    updateHexLiftAnimation(currentTimeMs, animationState, mapInstancedMeshes);
    
    // Update all active sphere animations
    Object.entries(animationState.activeSpheres).forEach(([sphereId, sphereAnim]) => {
        if (sphereAnim.isAnimating) {
            const sphere = allPhysicalSpheres.find(s => s.id === sphereId);
            if (sphere) {
                updateSpherePathAnimation(sphereAnim, sphere.body);
            }
        }
    });

    const surfaceHeight = 3;
    const sphereRadius = playerSphere && playerSphere.body.shapes[0] ? (playerSphere.body.shapes[0] as CANNON.Sphere).radius : 1;

    allPhysicalSpheres.forEach(sphereObj => {
        let floorY = surfaceHeight;
        const currentHex = worldPointToHex(new THREE.Vector3(sphereObj.body.position.x, sphereObj.body.position.y, sphereObj.body.position.z), hexDataMap);

        if (prevFloorY) {
            floorY = prevFloorY;
        }
        if (currentHex) {
            floorY = currentHex.baseHeight;
            prevFloorY = floorY;
        }

        const visualYMinimum = floorY + sphereRadius;

        const sphereBodyPosition = sphereObj.body.position;
        sphereObj.mesh.position.y = sphereObj.mesh.position.y < visualYMinimum ? visualYMinimum : sphereObj.mesh.position.y;
        sphereBodyPosition.y = sphereBodyPosition.y < visualYMinimum ? visualYMinimum : sphereBodyPosition.y;

        sphereObj.mesh.position.copy(sphereBodyPosition);
        sphereObj.mesh.quaternion.copy(sphereObj.body.quaternion);

        if (sphereObj.mesh.position.y < visualYMinimum && !animationState.activeSpheres[sphereObj.id]?.isAnimating) {
            sphereObj.mesh.position.y = sphereObj.mesh.position.y < visualYMinimum ? visualYMinimum : sphereObj.mesh.position.y;
        }
    });

    core.controls.update();
    core.renderer.render(core.scene, core.camera);
    stats.end();
}

main().catch(console.error);
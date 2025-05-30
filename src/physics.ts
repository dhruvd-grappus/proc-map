import * as CANNON from 'cannon-es';
import { defaultMaterial, world } from './globals'; // Assuming defaultMaterial is exported from globals

export function initializePhysicsWorld(): CANNON.World {
  const newWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²
  });
  newWorld.allowSleep = true;
  (newWorld.solver as CANNON.GSSolver).iterations = 20;
  (newWorld.solver as CANNON.GSSolver).tolerance = 0.01;

  // Default contact material setup (from main.js)
  const cannonDefaultMaterial = defaultMaterial; // Use the one from globals
  const defaultContactMaterial = new CANNON.ContactMaterial(
    cannonDefaultMaterial,
    cannonDefaultMaterial,
    {
      friction: 0.7,
      restitution: 0.05,
      contactEquationStiffness: 1e10,
      contactEquationRelaxation: 3,
      frictionEquationStiffness: 1e10,
      frictionEquationRelaxation: 3,
    }
  );
  newWorld.defaultContactMaterial = defaultContactMaterial;

  // Add ground plane (static) - this was also in main.js's physics setup
  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: cannonDefaultMaterial, // Use the global default material
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // make it face up
  newWorld.addBody(groundBody);

  return newWorld;
}

export function createSpherePhysicsBody(
  radius: number,
  initialPosition: CANNON.Vec3, // Changed from individual x,y,z to Vec3
  mass: number,
  material: CANNON.Material // Expect the material to be passed in
): CANNON.Body {
  const sphereBody = new CANNON.Body({
    mass: mass,
    shape: new CANNON.Sphere(radius),
    material: material,
    angularDamping: 0.8,
    linearDamping: 0.5,
    collisionResponse: true,
  });
  sphereBody.position.copy(initialPosition);
  sphereBody.sleepSpeedLimit = 0.2;
  sphereBody.sleepTimeLimit = 0.5;
  // @ts-ignore
  sphereBody.ccdSpeedThreshold = 10;
  // @ts-ignore
  sphereBody.ccdSweptSphereRadius = radius * 0.9;
  // world.addBody(sphereBody); // Caller should add the body to the world
  return sphereBody;
}

export function updatePhysics(
    physicsWorld: CANNON.World, // Renamed from world to avoid conflict with global
    currentLastCallTime: number | undefined,
    time: number, // current time in seconds from performance.now() / 1000
    currentTimeStep: number // The fixed timestep (e.g., 1/60)
    ): number { // Returns the new lastCallTime
  const maxSubSteps = 10; // Maximum number of physics sub-steps per frame

  if (currentLastCallTime === undefined) {
    // For the first frame, step with a fixed small dt to initialize
    physicsWorld.step(currentTimeStep, currentTimeStep, maxSubSteps);
  } else {
    const dt = time - currentLastCallTime;
    physicsWorld.step(currentTimeStep, dt, maxSubSteps);
  }
  return time; // Return current time as the new lastCallTime
}

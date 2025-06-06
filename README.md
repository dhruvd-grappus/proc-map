# 3D Hexagonal Map with Physics

A 3D interactive map application built with Three.js and Cannon.js, featuring hexagonal tiles, physics-based sphere movement, and real-time multiplayer capabilities.

## Project Structure

### Core Files

- `src/main.ts`: The main entry point that initializes the application, sets up the scene, and manages the game loop.
- `src/setup.ts`: Handles the initialization of Three.js scene, camera, renderer, and physics world.
- `src/config.ts`: Contains configuration constants used throughout the application.

### Map and Physics

- `src/mapGenerator.ts`: Generates the hexagonal map grid and handles terrain generation.
- `src/physicsObjects.ts`: Manages physics-based objects (spheres) and their interactions.
- `src/pathfinding.ts`: Implements A* pathfinding algorithm for sphere movement between hexes.

### Animation and Interaction

- `src/animation.ts`: Handles animations for hex lifting and sphere movement.
- `src/interaction.ts`: Manages user input, mouse controls, and interaction with the map.
- `src/assetLoader.ts`: Loads and manages textures, environment maps, and other assets.

### Networking

- `src/socketManager.ts`: Manages WebSocket connections for real-time multiplayer functionality.

### Types

- `src/types/index.ts`: Contains TypeScript interfaces and type definitions used across the application.

## Key Features

### Hexagonal Map
- Procedurally generated hexagonal grid
- Different terrain types with varying heights
- Interactive hex lifting animation

### Physics-Based Movement
- Spheres with realistic physics using Cannon.js
- Smooth pathfinding between hexes
- Jump mechanics with right-click

### Multiplayer Support
- Real-time sphere movement synchronization
- Socket.IO-based networking
- Automatic sphere creation/removal based on player presence

### Visual Effects
- Dynamic lighting and shadows
- Environment mapping for realistic reflections
- Smooth animations for all interactions

## Technical Details

### Physics Implementation
- Uses Cannon.js for physics simulation
- Spheres have realistic collision and movement
- Custom collision detection for hex interactions

### Animation System
- Smooth interpolation for sphere movement
- Hex lifting animations with easing
- Path-based movement with proper timing

### Networking Architecture
- WebSocket-based real-time communication
- Automatic reconnection handling
- State synchronization between clients

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

## Dependencies

- Three.js: 3D graphics rendering
- Cannon.js: Physics engine
- Socket.IO: Real-time networking
- TypeScript: Type safety and better development experience

## Development Notes

- The application uses TypeScript for better type safety and development experience
- Physics calculations are handled in a separate thread to maintain performance
- Asset loading is asynchronous to prevent blocking the main thread
- The codebase follows a modular structure for better maintainability 
import { HexData, HexDataMap, PathNode } from './globals'; // Assuming PathNode is in globals.ts

// Internal interface for A* nodes
interface AStarNode extends HexData {
  gCost: number;
  hCost: number;
  fCost: number;
  parent: AStarNode | null;
}

export function getHexNode(tileX: number, tileY: number, hexDataMap: HexDataMap): HexData | undefined {
  return hexDataMap.get(`${tileX},${tileY}`);
}

// Heuristic function (Hex-adapted Manhattan distance or similar)
export function heuristic(a: { tileX: number; tileY: number }, b: { tileX: number; tileY: number }): number {
  // Using the more advanced heuristic from the original code comments if possible,
  // or the simpler one if cube coordinates aren't readily available.
  // (Math.abs(a.tileX - b.tileX) + Math.abs(a.tileY - b.tileY) + Math.abs( (a.tileX - a.tileY) - (b.tileX - b.tileY) )) / 2;
  // Sticking to the one implemented in main.js for now:
  const dX = Math.abs(a.tileX - b.tileX);
  const dY = Math.abs(a.tileY - b.tileY);
  return dX + dY; // Placeholder, can be improved as per original comments
}

export function getHexNeighbors(tileX: number, tileY: number): Array<{ tileX: number; tileY: number }> {
  const neighbors: Array<{ tileX: number; tileY: number }> = [];
  const isEvenRow = tileY % 2 === 0;

  // Directions for "pointy top" hex grid based on original tileToPosition logic
  const directions = [
    { tileX: 1, tileY: 0 }, { tileX: -1, tileY: 0 }, // Right, Left
    { tileX: isEvenRow ? 0 : 1, tileY: -1 }, { tileX: isEvenRow ? -1 : 0, tileY: -1 }, // UpperRight, UpperLeft
    { tileX: isEvenRow ? 0 : 1, tileY: 1 }, { tileX: isEvenRow ? -1 : 0, tileY: 1 },  // LowerRight, LowerLeft
  ];

  for (const dir of directions) {
    neighbors.push({ tileX: tileX + dir.tileX, tileY: tileY + dir.tileY });
  }
  return neighbors;
}

export function reconstructPath(targetNode: AStarNode): PathNode[] {
  const path: PathNode[] = [];
  let currentNode: AStarNode | null = targetNode;
  while (currentNode) {
    // Ensure only PathNode properties are pushed
    path.push({
      tileX: currentNode.tileX,
      tileY: currentNode.tileY,
      worldPos: currentNode.worldPos, // worldPos is Vector2 in HexData
      baseHeight: currentNode.baseHeight,
    });
    currentNode = currentNode.parent;
  }
  return path.reverse();
}

export function aStarPathfinding(
  startCoords: { tileX: number; tileY: number },
  targetCoords: { tileX: number; tileY: number },
  hexDataMap: HexDataMap
): PathNode[] {
  const openSet = new Map<string, AStarNode>(); // Key: "x,y"
  const closedSet = new Set<string>(); // Key: "x,y"

  const startHexData = getHexNode(startCoords.tileX, startCoords.tileY, hexDataMap);
  if (!startHexData) return [];

  const targetHexData = getHexNode(targetCoords.tileX, targetCoords.tileY, hexDataMap);
  if (!targetHexData) return [];

  const startNode: AStarNode = {
    ...startHexData,
    gCost: 0,
    hCost: heuristic(startCoords, targetCoords),
    fCost: heuristic(startCoords, targetCoords),
    parent: null,
  };

  const startKey = `${startCoords.tileX},${startCoords.tileY}`;
  openSet.set(startKey, startNode);

  while (openSet.size > 0) {
    let currentNodeEntry: [string, AStarNode] | null = null;
    // Find node with lowest fCost in openSet
    for (const entry of openSet.entries()) {
      if (currentNodeEntry === null || entry[1].fCost < currentNodeEntry[1].fCost) {
        currentNodeEntry = entry;
      }
    }

    if (!currentNodeEntry) return []; // Should not happen if openSet is not empty

    const currentKey = currentNodeEntry[0];
    const currentNode = currentNodeEntry[1];

    if (currentNode.tileX === targetCoords.tileX && currentNode.tileY === targetCoords.tileY) {
      return reconstructPath(currentNode);
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    for (const neighborCoords of getHexNeighbors(currentNode.tileX, currentNode.tileY)) {
      const neighborKey = `${neighborCoords.tileX},${neighborCoords.tileY}`;
      if (closedSet.has(neighborKey)) continue;

      const neighborHexData = getHexNode(neighborCoords.tileX, neighborCoords.tileY, hexDataMap);
      if (!neighborHexData) continue; // Neighbor doesn't exist or is an obstacle

      // Consider if neighbor is walkable (e.g., not a 'stone' tile if desired)
      // For now, all existing hexes are considered walkable.

      const gCostToNeighbor = currentNode.gCost + 1; // Cost of 1 to move to any neighbor

      let neighborNode = openSet.get(neighborKey);
      if (!neighborNode || gCostToNeighbor < neighborNode.gCost) {
        // If neighborNode is not in openSet or we found a better path
        if (!neighborNode) {
            // If it's not in openSet, create it.
            // Ensure all properties of AStarNode are initialized.
            neighborNode = {
                ...neighborHexData, // Spread HexData properties
                gCost: gCostToNeighbor,
                hCost: heuristic(neighborCoords, targetCoords),
                fCost: gCostToNeighbor + heuristic(neighborCoords, targetCoords),
                parent: currentNode
            };
        } else {
            // If it is in openSet but we found a better path, update it.
            neighborNode.parent = currentNode;
            neighborNode.gCost = gCostToNeighbor;
            neighborNode.fCost = neighborNode.gCost + neighborNode.hCost; // hCost is already set
        }
        openSet.set(neighborKey, neighborNode);
      }
    }
  }
  return []; // Path not found
}

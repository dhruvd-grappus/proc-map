// --- A* Pathfinding Implementation ---

// Helper function (not exported, used by findPathAStar)
function heuristic(hexA, hexB) {
  // Simple Euclidean distance on world positions for simplicity, good enough for A*
  // hexA and hexB are expected to have a 'worldPosition' property (THREE.Vector2)
  const dx = hexA.worldPosition.x - hexB.worldPosition.x;
  const dy = hexA.worldPosition.y - hexB.worldPosition.y; // This is XZ plane distance
  return Math.sqrt(dx * dx + dy * dy);
}

function getHexNeighbors(currentHex, allHexData) {
  const neighbors = [];
  // currentHex is expected to have gridX, gridY properties.
  // allHexData is an array of hex objects.
  const directions =
    currentHex.gridY % 2 === 0
      ? [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [-1, 1], [-1, -1], // Even rows
        ]
      : [
          [1, 0], [-1, 0], [0, 1], [0, -1],
          [1, 1], [1, -1], // Odd rows
        ];

  for (const [dx, dy] of directions) {
    const nx = currentHex.gridX + dx;
    const ny = currentHex.gridY + dy;
    const neighbor = allHexData.find(
      (h) => h.gridX === nx && h.gridY === ny
    );
    if (neighbor) {
      neighbors.push(neighbor);
    }
  }
  return neighbors;
}

function findPathAStar(startHex, endHex, allHexData) {
  console.log("A* Pathfinding: Start:", startHex.id, "End:", endHex.id);
  let openSet = [startHex];
  const cameFrom = new Map(); // Stores the previous hex in the optimal path

  const gScore = new Map(); // Cost from start to current hex
  allHexData.forEach((hex) => gScore.set(hex.id, Infinity));
  gScore.set(startHex.id, 0);

  const fScore = new Map(); // Total cost (gScore + heuristic)
  allHexData.forEach((hex) => fScore.set(hex.id, Infinity));
  fScore.set(startHex.id, heuristic(startHex, endHex));

  while (openSet.length > 0) {
    // Find hex in openSet with the lowest fScore
    openSet.sort((a, b) => fScore.get(a.id) - fScore.get(b.id));
    let current = openSet.shift(); // Get the hex with the lowest fScore

    if (current.id === endHex.id) {
      // Reconstruct path
      const totalPath = [current];
      while (cameFrom.has(current.id)) {
        current = cameFrom.get(current.id);
        totalPath.unshift(current);
      }
              console.log("A* Pathfinding: Path found. Length:", totalPath.length);
      return totalPath;
    }

    getHexNeighbors(current, allHexData).forEach((neighbor) => {
      // Assuming cost to move to a neighbor is 1 (can be adjusted for terrain cost)
      const tentativeGScore = gScore.get(current.id) + 1; 
      if (tentativeGScore < gScore.get(neighbor.id)) {
        cameFrom.set(neighbor.id, current);
        gScore.set(neighbor.id, tentativeGScore);
        fScore.set(
          neighbor.id,
          tentativeGScore + heuristic(neighbor, endHex)
        );
        if (!openSet.some((h) => h.id === neighbor.id)) {
          openSet.push(neighbor);
        }
      }
    });
  }
          console.log("A* Pathfinding: No path found.");
  return null; // No path found
}

export { getHexNeighbors, findPathAStar, heuristic };

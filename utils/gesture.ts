// utils/gesture.ts
export function isHandClosed(landmarks: any[]) {
  if (!landmarks || landmarks.length === 0) return false;

  const wrist = landmarks[0];
  
  // Array of fingers with their Tip and Base Knuckle (MCP) landmark indices
  const fingers = [
    { tip: 8, mcp: 5 },   // Index finger
    { tip: 12, mcp: 9 },  // Middle finger
    { tip: 16, mcp: 13 }, // Ring finger
    { tip: 20, mcp: 17 }  // Pinky finger
  ];
  
  // Helper to calculate 3D distance between two points
  const getDistance = (p1: any, p2: any) => Math.sqrt(
    Math.pow(p1.x - p2.x, 2) + 
    Math.pow(p1.y - p2.y, 2) + 
    Math.pow(p1.z - p2.z, 2)
  );

  let isClosed = true;

  for (const finger of fingers) {
    const tipDist = getDistance(landmarks[finger.tip], wrist);
    const mcpDist = getDistance(landmarks[finger.mcp], wrist);
    
    // If the tip is further from the wrist than the knuckle is, the finger is extended
    if (tipDist > mcpDist) {
      isClosed = false;
      break; 
    }
  }

  return isClosed;
}

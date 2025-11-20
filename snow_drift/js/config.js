/**
 * Game Configuration
 * Central place for all game constants and settings
 */
export const CONFIG = {
    // World Settings
    groundSize: 400,
    treeCount: 60,
    
    // Particle Settings
    snowCount: 2000,
    trailParticleCount: 300,
    
    // Camera Settings
    cameraHeight: 15,
    cameraDistance: 25,
    cameraLerpFactor: 0.1,
    cameraFOV: 60,
    
    // Physics Settings
    maxSpeed: 1.8,
    boostSpeed: 2.5,
    acceleration: 0.03,
    driftModeAcceleration: 0.02,  // Reduced acceleration when drifting
    friction: 0.98,          // General air resistance
    turnSpeed: 0.04,
    driftFactor: 0.54,       // How much velocity aligns with heading per frame (Lower = More Drift/Ice)
    driftModeFactor: 0.65,   // Drift factor when drift mode is active (even more sliding)
    gripThreshold: 0.1,      // Speed needed to steer effectively
    bounceCoefficient: 0.5,  // How much velocity is retained after boundary collision
    
    // Visual Settings
    fogDensity: 0.015,
    skyColor: 0xaaccff,
    gridOpacity: 0.3,
    
    // Car Settings
    carColor: 0xd92525,      // Red
    wheelColor: 0x111111,    // Black
    cabinColor: 0x333333,    // Dark gray
    headlightColor: 0xffffee,
    headlightIntensity: 5,
    headlightDistance: 60,
    headlightAngle: 0.5,
    
    // Environment Settings
    treeColor: 0x2d4c1e,     // Dark green
    trunkColor: 0x4a3c31,    // Brown
    snowCapColor: 0xffffff,
    
    // Lighting
    ambientLightIntensity: 0.6,
    directionalLightIntensity: 0.8,
    
    // Particle Effects
    snowFallSpeed: 0.2,
    snowRespawnHeight: 50,
    trailParticleLife: 1.5,       // Longer life for more visible trails
    trailParticleDecay: 0.015,    // Slower decay
    trailParticleRise: 0.08,      // Rise faster for more dramatic effect
    trailParticleSize: 0.6,       // Larger particles
    trailParticleOpacity: 0.9,    // More opaque
    
    // Gameplay
    speedMultiplier: 50,          // Convert internal speed to km/h for display
    driftScoreMinSpeed: 52,       // Minimum km/h speed to earn drift points
    driftScoreMinAngle: 0.03,     // Minimum turning angle (radians) to count as drifting
    driftScorePerTick: 1,         // Base points awarded per frame while drifting
    driftScoreSpeedBonus: 0.5,    // Bonus multiplier per 10 km/h above minimum
    driftScoreAngleBonus: 20      // Bonus multiplier for drift angle (higher = more points for sharper turns)
};

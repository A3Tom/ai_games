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
    friction: 0.98,          // General air resistance
    turnSpeed: 0.04,
    driftFactor: 0.94,       // How much velocity aligns with heading per frame (Lower = More Drift/Ice)
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
    trailParticleLife: 1.0,
    trailParticleDecay: 0.02,
    trailParticleRise: 0.05,
    
    // Gameplay
    speedMultiplier: 50       // Convert internal speed to km/h for display
};

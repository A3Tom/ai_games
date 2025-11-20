import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Snow Particle System
 * Manages falling snow particles that follow the player
 */
export class SnowParticles {
    constructor(scene) {
        this.scene = scene;
        this.system = null;
        
        this._createSnowSystem();
    }
    
    _createSnowSystem() {
        const snowGeo = new THREE.BufferGeometry();
        const snowPos = [];
        
        for(let i = 0; i < CONFIG.snowCount; i++) {
            snowPos.push(
                (Math.random() - 0.5) * CONFIG.groundSize,
                Math.random() * CONFIG.snowRespawnHeight,
                (Math.random() - 0.5) * CONFIG.groundSize
            );
        }
        
        snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(snowPos, 3));
        
        const snowMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.4,
            transparent: true,
            opacity: 0.8
        });
        
        this.system = new THREE.Points(snowGeo, snowMat);
        this.scene.add(this.system);
    }
    
    update(carPosition) {
        const positions = this.system.geometry.attributes.position.array;
        
        // Animate snowfall
        for(let i = 1; i < positions.length; i += 3) {
            positions[i] -= CONFIG.snowFallSpeed;
            
            // Reset to top when snow reaches ground
            if (positions[i] < 0) {
                positions[i] = CONFIG.snowRespawnHeight;
            }
        }
        
        this.system.geometry.attributes.position.needsUpdate = true;
        
        // Move snow system with car to create infinite snow effect
        this.system.position.x = carPosition.x;
        this.system.position.z = carPosition.z;
    }
}

/**
 * Trail Particle System
 * Creates snow spray effects behind the car when drifting
 */
export class TrailParticles {
    constructor(scene) {
        this.scene = scene;
        this.system = null;
        this.particles = [];
        this.particleIdx = 0;
        
        this._createTrailSystem();
    }
    
    _createTrailSystem() {
        const trailGeo = new THREE.BufferGeometry();
        const trailPositions = new Float32Array(CONFIG.trailParticleCount * 3);
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        
        const trailMat = new THREE.PointsMaterial({ 
            color: 0xffffff, 
            size: CONFIG.trailParticleSize, 
            transparent: true, 
            opacity: CONFIG.trailParticleOpacity 
        });
        
        this.system = new THREE.Points(trailGeo, trailMat);
        this.scene.add(this.system);
        
        // Initialize particle data
        for(let i = 0; i < CONFIG.trailParticleCount; i++) {
            this.particles.push({
                x: 0, 
                y: -100, 
                z: 0,
                life: 0,
                vx: 0, 
                vy: 0, 
                vz: 0
            });
        }
    }
    
    update(carState) {
        const posAttribute = this.system.geometry.attributes.position;
        
        // Spawn particles when drifting (guaranteed) or when moving at speed
        if (carState.isDrifting && carState.speed > 0.1) {
            // Always spawn multiple particles per frame when drifting
            for(let s = 0; s < 3; s++) {
                this._spawnParticles(carState);
            }
        } else if (carState.speed > 0.3 && Math.random() < 0.3) {
            // Occasional particles when just driving fast (not drifting)
            this._spawnParticles(carState);
        }
        
        // Update all particles
        for(let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            
            if (p.life > 0) {
                p.life -= CONFIG.trailParticleDecay;
                p.y += CONFIG.trailParticleRise; // Rise up like snow dust
                
                // Apply lateral velocity (drift spread effect)
                p.x += p.vx;
                p.z += p.vz;
                
                // Dampen velocity over time
                p.vx *= 0.95;
                p.vz *= 0.95;
                
                posAttribute.setXYZ(i, p.x, p.y, p.z);
            } else {
                // Hide inactive particles
                posAttribute.setXYZ(i, 0, -100, 0);
            }
        }
        
        posAttribute.needsUpdate = true;
    }
    
    _spawnParticles(carState) {
        // Spawn particles from both rear wheels
        for(let w = -1; w <= 1; w += 2) { // -1 for left, 1 for right
            const p = this.particles[this.particleIdx];
            
            // Wheel offset relative to car center
            const wx = w * 1.1;  // Width offset
            const wz = -1.5;     // Rear position
            
            // Transform to world coordinates
            const cos = Math.cos(carState.angle);
            const sin = Math.sin(carState.angle);
            
            // Add some random spread for more natural effect (reduced when drifting for tighter trail)
            const spreadMultiplier = carState.isDrifting ? 0.3 : 0.5;
            const spreadX = (Math.random() - 0.5) * spreadMultiplier;
            const spreadZ = (Math.random() - 0.5) * spreadMultiplier;
            
            p.x = carState.x + (wx * cos + wz * sin) + spreadX;
            p.z = carState.z + (-wx * sin + wz * cos) + spreadZ;
            p.y = 0.1 + Math.random() * 0.1; // Slight random height
            p.life = CONFIG.trailParticleLife;
            
            // Add stronger lateral velocity when drifting for more dramatic effect
            if (carState.isDrifting) {
                // Particles spray out to the side based on drift direction
                const driftDirection = w; // Left or right wheel
                p.vx = (Math.random() - 0.5) * 0.3 + driftDirection * 0.1;
                p.vz = (Math.random() - 0.5) * 0.3;
            } else {
                p.vx = 0;
                p.vz = 0;
            }
            
            this.particleIdx = (this.particleIdx + 1) % this.particles.length;
        }
    }
}

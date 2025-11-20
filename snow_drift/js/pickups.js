import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * PickupManager Class
 * Manages Buckfast bottle pickups scattered around the map
 */
export class PickupManager {
    constructor(scene) {
        this.scene = scene;
        this.pickups = [];
        this.collectedPickups = new Set();
        this.respawnTimers = new Map();
        
        this._createPickups();
    }
    
    _createPickups() {
        const halfSize = CONFIG.groundSize / 2 - 20; // Keep away from edges
        
        for (let i = 0; i < CONFIG.pickupCount; i++) {
            const pickup = this._createBuckfastBottle();
            
            // Random position on the map
            const x = (Math.random() - 0.5) * halfSize * 2;
            const z = (Math.random() - 0.5) * halfSize * 2;
            pickup.position.set(x, 1, z);
            
            // Store initial Y position for bobbing animation
            pickup.userData.initialY = 1;
            pickup.userData.bobOffset = Math.random() * Math.PI * 2; // Random phase for variety
            pickup.userData.id = i;
            
            this.scene.add(pickup);
            this.pickups.push(pickup);
        }
    }
    
    _createBuckfastBottle() {
        const bottle = new THREE.Group();
        
        // Bottle body (wider, flatter shape like the real bottle)
        const bodyGeometry = new THREE.CylinderGeometry(0.45, 0.45, 2.2, 12);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a0d00, // Very dark brown/black glass
            transparent: true,
            opacity: 0.85,
            roughness: 0.2,
            metalness: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.1;
        bottle.add(body);
        
        // Bottle shoulder (tapered section)
        const shoulderGeometry = new THREE.CylinderGeometry(0.25, 0.45, 0.4, 12);
        const shoulder = new THREE.Mesh(shoulderGeometry, bodyMaterial);
        shoulder.position.y = 2.4;
        bottle.add(shoulder);
        
        // Bottle neck
        const neckGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.6, 12);
        const neck = new THREE.Mesh(neckGeometry, bodyMaterial);
        neck.position.y = 2.9;
        bottle.add(neck);
        
        // Bottle cap (gold/yellow screw cap)
        const capGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.25, 12);
        const capMaterial = new THREE.MeshStandardMaterial({
            color: 0xDAA520, // Goldenrod
            roughness: 0.5,
            metalness: 0.7
        });
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.position.y = 3.35;
        bottle.add(cap);
        
        // Main yellow label (large, covering most of the bottle like in the photo)
        const labelGeometry = new THREE.CylinderGeometry(0.47, 0.47, 1.8, 12);
        const labelMaterial = new THREE.MeshStandardMaterial({
            color: 0xF4C430, // Saffron yellow (Buckfast signature color)
            roughness: 0.8,
            emissive: 0xF4C430,
            emissiveIntensity: 0.1
        });
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.y = 1.3;
        bottle.add(label);
        
        // Red "Buckfast" text area (horizontal band)
        const redBandGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 12);
        const redBandMaterial = new THREE.MeshStandardMaterial({
            color: 0xC41E3A, // Cardinal red
            roughness: 0.7
        });
        const redBand = new THREE.Mesh(redBandGeometry, redBandMaterial);
        redBand.position.y = 1.6;
        bottle.add(redBand);
        
        // Dark band at top of label
        const darkBandGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.2, 12);
        const darkBandMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513, // Saddle brown
            roughness: 0.7
        });
        const darkBand = new THREE.Mesh(darkBandGeometry, darkBandMaterial);
        darkBand.position.y = 2.1;
        bottle.add(darkBand);
        
        // Bottom label detail (grapes/monastery image area)
        const bottomDetailGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.4, 12);
        const bottomDetailMaterial = new THREE.MeshStandardMaterial({
            color: 0xE6B800, // Darker yellow for contrast
            roughness: 0.8
        });
        const bottomDetail = new THREE.Mesh(bottomDetailGeometry, bottomDetailMaterial);
        bottomDetail.position.y = 0.7;
        bottle.add(bottomDetail);
        
        // Glow effect (subtle golden glow)
        const glowLight = new THREE.PointLight(0xF4C430, 0.8, 10);
        glowLight.position.y = 1.5;
        bottle.add(glowLight);
        
        return bottle;
    }
    
    update(carPosition, deltaTime = 1/60) {
        // Update bobbing animation and rotation
        this.pickups.forEach((pickup, index) => {
            if (this.collectedPickups.has(index)) {
                return; // Skip collected pickups
            }
            
            // Bobbing animation
            const bobOffset = pickup.userData.bobOffset;
            const time = Date.now() * CONFIG.pickupBobSpeed;
            pickup.position.y = pickup.userData.initialY + 
                Math.sin(time + bobOffset) * CONFIG.pickupBobAmount;
            
            // Rotation
            pickup.rotation.y += CONFIG.pickupRotationSpeed;
        });
        
        // Handle respawn timers
        this.respawnTimers.forEach((timer, pickupId) => {
            timer.timeLeft -= deltaTime;
            if (timer.timeLeft <= 0) {
                this._respawnPickup(pickupId);
                this.respawnTimers.delete(pickupId);
            }
        });
    }
    
    checkCollisions(carPosition) {
        const collectedPickups = [];
        const collectionRadius = 2; // Distance to collect pickup
        
        this.pickups.forEach((pickup, index) => {
            if (this.collectedPickups.has(index)) {
                return; // Skip already collected pickups
            }
            
            const dx = pickup.position.x - carPosition.x;
            const dz = pickup.position.z - carPosition.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < collectionRadius) {
                this._collectPickup(index);
                collectedPickups.push(index);
            }
        });
        
        return collectedPickups;
    }
    
    _collectPickup(pickupId) {
        const pickup = this.pickups[pickupId];
        
        // Hide the pickup
        pickup.visible = false;
        this.collectedPickups.add(pickupId);
        
        // Set respawn timer
        this.respawnTimers.set(pickupId, {
            timeLeft: CONFIG.pickupRespawnTime
        });
        
        // Visual effect: quick scale-up before hiding
        const originalScale = pickup.scale.clone();
        pickup.scale.multiplyScalar(1.5);
        setTimeout(() => {
            pickup.scale.copy(originalScale);
        }, 100);
    }
    
    _respawnPickup(pickupId) {
        const pickup = this.pickups[pickupId];
        const halfSize = CONFIG.groundSize / 2 - 20;
        
        // Random new position
        const x = (Math.random() - 0.5) * halfSize * 2;
        const z = (Math.random() - 0.5) * halfSize * 2;
        pickup.position.x = x;
        pickup.position.z = z;
        pickup.userData.initialY = 1;
        
        // Make visible again
        pickup.visible = true;
        this.collectedPickups.delete(pickupId);
    }
    
    reset() {
        // Reset all pickups
        this.collectedPickups.clear();
        this.respawnTimers.clear();
        
        this.pickups.forEach(pickup => {
            pickup.visible = true;
        });
    }
}

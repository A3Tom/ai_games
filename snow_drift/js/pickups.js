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
        
        // Bottle body (main cylinder)
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d1800, // Dark brown glass
            transparent: true,
            opacity: 0.8,
            roughness: 0.3,
            metalness: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1;
        bottle.add(body);
        
        // Bottle neck
        const neckGeometry = new THREE.CylinderGeometry(0.15, 0.3, 0.6, 8);
        const neck = new THREE.Mesh(neckGeometry, bodyMaterial);
        neck.position.y = 2.3;
        bottle.add(neck);
        
        // Bottle cap
        const capGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.2, 8);
        const capMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFD700, // Gold
            roughness: 0.4,
            metalness: 0.6
        });
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.position.y = 2.7;
        bottle.add(cap);
        
        // Yellow label (iconic Buckfast label)
        const labelGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.8, 8);
        const labelMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFD700, // Yellow/gold
            roughness: 0.7
        });
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.y = 1.2;
        bottle.add(label);
        
        // Red stripe on label
        const stripeGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.15, 8);
        const stripeMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B0000, // Dark red
            roughness: 0.7
        });
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.y = 1.2;
        bottle.add(stripe);
        
        // Glow effect (point light)
        const glowLight = new THREE.PointLight(0xFFD700, 1, 8);
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

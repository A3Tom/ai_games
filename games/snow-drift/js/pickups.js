import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * PickupManager Class
 * Manages Buckfast bottle pickups and police hat pickups scattered around the map
 */
export class PickupManager {
    constructor(scene) {
        this.scene = scene;
        this.pickups = [];
        this.policeHats = [];
        this.collectedPickups = new Set();
        this.collectedPoliceHats = new Set();
        this.respawnTimers = new Map();
        this.policeHatRespawnTimers = new Map();
        
        this._createPickups();
        this._createPoliceHats();
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
    
    _createPoliceHats() {
        const halfSize = CONFIG.groundSize / 2 - 20;
        
        for (let i = 0; i < CONFIG.policeHatCount; i++) {
            const hat = this._createPoliceHat();
            
            // Random position on the map
            const x = (Math.random() - 0.5) * halfSize * 2;
            const z = (Math.random() - 0.5) * halfSize * 2;
            hat.position.set(x, 1.5, z);
            
            // Store initial Y position for bobbing animation
            hat.userData.initialY = 1.5;
            hat.userData.bobOffset = Math.random() * Math.PI * 2;
            hat.userData.id = i;
            hat.userData.type = 'policeHat';
            
            this.scene.add(hat);
            this.policeHats.push(hat);
        }
    }
    
    _createPoliceHat() {
        const hat = new THREE.Group();
        
        // Dome-shaped crown (main body of custodian helmet)
        const crownGeometry = new THREE.SphereGeometry(0.65, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
        const crownMaterial = new THREE.MeshStandardMaterial({
            color: 0x000080, // Navy blue
            roughness: 0.3,
            metalness: 0.1
        });
        const crown = new THREE.Mesh(crownGeometry, crownMaterial);
        crown.position.y = 0.7;
        hat.add(crown);
        
        // Helmet body (cylindrical section)
        const bodyGeometry = new THREE.CylinderGeometry(0.65, 0.7, 0.5, 16);
        const body = new THREE.Mesh(bodyGeometry, crownMaterial);
        body.position.y = 0.45;
        hat.add(body);
        
        // Hat brim (wider flat disc)
        const brimGeometry = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 16);
        const brimMaterial = new THREE.MeshStandardMaterial({
            color: 0x000050, // Darker blue
            roughness: 0.4,
            metalness: 0.15
        });
        const brim = new THREE.Mesh(brimGeometry, brimMaterial);
        brim.position.y = 0.15;
        hat.add(brim);
        
        // Chrome band around helmet
        const bandGeometry = new THREE.CylinderGeometry(0.72, 0.72, 0.08, 16);
        const bandMaterial = new THREE.MeshStandardMaterial({
            color: 0xC0C0C0, // Silver/chrome
            roughness: 0.2,
            metalness: 0.9
        });
        const band = new THREE.Mesh(bandGeometry, bandMaterial);
        band.position.y = 0.2;
        hat.add(band);
        
        // Coxcomb (raised spine at top - characteristic of British police helmet)
        const coxcombGeometry = new THREE.BoxGeometry(0.15, 0.8, 0.08);
        const coxcombMaterial = new THREE.MeshStandardMaterial({
            color: 0x000080,
            roughness: 0.3,
            metalness: 0.1
        });
        const coxcomb = new THREE.Mesh(coxcombGeometry, coxcombMaterial);
        coxcomb.position.y = 0.75;
        hat.add(coxcomb);
        
        // Brunswick star badge on front (iconic British police emblem)
        const starPoints = [];
        const starInnerRadius = 0.08;
        const starOuterRadius = 0.18;
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            const angleNext = ((i + 0.5) * Math.PI * 2) / 8;
            starPoints.push(new THREE.Vector2(Math.cos(angle) * starOuterRadius, Math.sin(angle) * starOuterRadius));
            starPoints.push(new THREE.Vector2(Math.cos(angleNext) * starInnerRadius, Math.sin(angleNext) * starInnerRadius));
        }
        const starShape = new THREE.Shape(starPoints);
        const starGeometry = new THREE.ExtrudeGeometry(starShape, {
            depth: 0.03,
            bevelEnabled: false
        });
        const starMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFD700, // Gold
            roughness: 0.2,
            metalness: 0.8,
            emissive: 0xFFD700,
            emissiveIntensity: 0.1
        });
        const star = new THREE.Mesh(starGeometry, starMaterial);
        star.position.set(0, 0.5, 0.7);
        star.rotation.x = Math.PI / 2;
        hat.add(star);
        
        // Central cipher/number on badge
        const circleGeometry = new THREE.CircleGeometry(0.06, 16);
        const circleMaterial = new THREE.MeshStandardMaterial({
            color: 0x000080, // Blue center
            roughness: 0.5
        });
        const circle = new THREE.Mesh(circleGeometry, circleMaterial);
        circle.position.set(0, 0.5, 0.72);
        hat.add(circle);
        
        // Rose top ornament (ventilation cover)
        const roseGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8);
        const roseMaterial = new THREE.MeshStandardMaterial({
            color: 0xC0C0C0, // Silver
            roughness: 0.3,
            metalness: 0.8
        });
        const rose = new THREE.Mesh(roseGeometry, roseMaterial);
        rose.position.y = 1.15;
        hat.add(rose);
        
        // Small decorative petals on rose top
        for (let i = 0; i < 6; i++) {
            const petalGeometry = new THREE.BoxGeometry(0.08, 0.03, 0.03);
            const petal = new THREE.Mesh(petalGeometry, roseMaterial);
            const angle = (i * Math.PI * 2) / 6;
            petal.position.set(
                Math.sin(angle) * 0.08,
                1.15,
                Math.cos(angle) * 0.08
            );
            petal.rotation.y = -angle;
            hat.add(petal);
        }
        
        // Warning light effect (subtle red glow)
        const glowLight = new THREE.PointLight(0xFF0000, 0.5, 6);
        glowLight.position.y = 1.2;
        hat.add(glowLight);
        
        return hat;
    }
    
    update(carPosition, deltaTime = 1/60) {
        // Update bobbing animation and rotation for bottles
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
        
        // Update bobbing animation and rotation for police hats
        this.policeHats.forEach((hat, index) => {
            if (this.collectedPoliceHats.has(index)) {
                return; // Skip collected hats
            }
            
            // Bobbing animation
            const bobOffset = hat.userData.bobOffset;
            const time = Date.now() * CONFIG.pickupBobSpeed;
            hat.position.y = hat.userData.initialY + 
                Math.sin(time + bobOffset) * CONFIG.pickupBobAmount;
            
            // Rotation
            hat.rotation.y += CONFIG.pickupRotationSpeed;
        });
        
        // Handle bottle respawn timers
        this.respawnTimers.forEach((timer, pickupId) => {
            timer.timeLeft -= deltaTime;
            if (timer.timeLeft <= 0) {
                this._respawnPickup(pickupId);
                this.respawnTimers.delete(pickupId);
            }
        });
        
        // Handle police hat respawn timers
        this.policeHatRespawnTimers.forEach((timer, hatId) => {
            timer.timeLeft -= deltaTime;
            if (timer.timeLeft <= 0) {
                this._respawnPoliceHat(hatId);
                this.policeHatRespawnTimers.delete(hatId);
            }
        });
    }
    
    checkCollisions(carPosition) {
        const collectedPickups = [];
        const collectedHats = [];
        const collectionRadius = 2; // Distance to collect pickup
        
        // Check bottle collisions
        this.pickups.forEach((pickup, index) => {
            if (this.collectedPickups.has(index)) {
                return; // Skip already collected pickups
            }
            
            const dx = pickup.position.x - carPosition.x;
            const dz = pickup.position.z - carPosition.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < collectionRadius) {
                this._collectPickup(index);
                collectedPickups.push({ type: 'bottle', index });
            }
        });
        
        // Check police hat collisions
        this.policeHats.forEach((hat, index) => {
            if (this.collectedPoliceHats.has(index)) {
                return; // Skip already collected hats
            }
            
            const dx = hat.position.x - carPosition.x;
            const dz = hat.position.z - carPosition.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < collectionRadius) {
                this._collectPoliceHat(index);
                collectedHats.push({ type: 'policeHat', index });
            }
        });
        
        return { bottles: collectedPickups, hats: collectedHats };
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
    
    _collectPoliceHat(hatId) {
        const hat = this.policeHats[hatId];
        
        // Hide the hat
        hat.visible = false;
        this.collectedPoliceHats.add(hatId);
        
        // Set respawn timer
        this.policeHatRespawnTimers.set(hatId, {
            timeLeft: CONFIG.policeHatRespawnTime
        });
        
        // Visual effect: quick scale-up before hiding
        const originalScale = hat.scale.clone();
        hat.scale.multiplyScalar(1.5);
        setTimeout(() => {
            hat.scale.copy(originalScale);
        }, 100);
    }
    
    _respawnPoliceHat(hatId) {
        const hat = this.policeHats[hatId];
        const halfSize = CONFIG.groundSize / 2 - 20;
        
        // Random new position
        const x = (Math.random() - 0.5) * halfSize * 2;
        const z = (Math.random() - 0.5) * halfSize * 2;
        hat.position.x = x;
        hat.position.z = z;
        hat.userData.initialY = 1.5;
        
        // Make visible again
        hat.visible = true;
        this.collectedPoliceHats.delete(hatId);
    }
    
    reset() {
        // Reset all pickups
        this.collectedPickups.clear();
        this.collectedPoliceHats.clear();
        this.respawnTimers.clear();
        this.policeHatRespawnTimers.clear();
        
        this.pickups.forEach(pickup => {
            pickup.visible = true;
        });
        
        this.policeHats.forEach(hat => {
            hat.visible = true;
        });
    }
}

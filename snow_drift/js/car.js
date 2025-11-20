import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Car Class
 * Handles car model creation, physics, and movement
 */
export class Car {
    constructor(scene) {
        this.scene = scene;
        
        // Physics state
        this.state = {
            x: 0,
            z: 0,
            vx: 0,
            vz: 0,
            angle: 0,
            previousAngle: 0,
            angleDelta: 0,
            speed: 0,
            steerAccumulator: 0  // Accumulated steering input
        };
        
        // 3D group containing all car parts
        this.group = new THREE.Group();
        this.wheels = {
            frontLeft: null,
            frontRight: null,
            backLeft: null,
            backRight: null
        };
        
        this._buildCarModel();
        this.scene.add(this.group);
    }
    
    _buildCarModel() {
        // Chassis
        const chassisGeo = new THREE.BoxGeometry(2, 1, 4.5);
        const chassisMat = new THREE.MeshStandardMaterial({ 
            color: CONFIG.carColor, 
            roughness: 0.4, 
            metalness: 0.3 
        });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.position.y = 0.7;
        chassis.castShadow = true;
        this.group.add(chassis);

        // Cabin/Roof
        const cabinGeo = new THREE.BoxGeometry(1.8, 0.8, 2.5);
        const cabinMat = new THREE.MeshStandardMaterial({ color: CONFIG.cabinColor });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.y = 1.4;
        cabin.castShadow = true;
        this.group.add(cabin);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: CONFIG.wheelColor });
        
        this.wheels.frontLeft = this._addWheel(wheelGeo, wheelMat, -1.1, 1.5);
        this.wheels.frontRight = this._addWheel(wheelGeo, wheelMat, 1.1, 1.5);
        this.wheels.backLeft = this._addWheel(wheelGeo, wheelMat, -1.1, -1.5);
        this.wheels.backRight = this._addWheel(wheelGeo, wheelMat, 1.1, -1.5);

        // Headlights
        this._addHeadlights();
    }
    
    _addWheel(geometry, material, x, z) {
        const wheel = new THREE.Mesh(geometry, material);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.4, z);
        wheel.castShadow = true;
        this.group.add(wheel);
        return wheel;
    }
    
    _addHeadlights() {
        const hlLeft = new THREE.SpotLight(
            CONFIG.headlightColor, 
            CONFIG.headlightIntensity, 
            CONFIG.headlightDistance, 
            CONFIG.headlightAngle, 
            0.5, 
            1
        );
        hlLeft.position.set(-0.6, 1, 2);
        hlLeft.target.position.set(-0.6, 0, 10);
        this.group.add(hlLeft);
        this.group.add(hlLeft.target);

        const hlRight = new THREE.SpotLight(
            CONFIG.headlightColor, 
            CONFIG.headlightIntensity, 
            CONFIG.headlightDistance, 
            CONFIG.headlightAngle, 
            0.5, 
            1
        );
        hlRight.position.set(0.6, 1, 2);
        hlRight.target.position.set(0.6, 0, 10);
        this.group.add(hlRight);
        this.group.add(hlRight.target);
    }
    
    /**
     * Update car physics based on input
     * @param {Object} inputs - Input state from InputManager
     */
    update(inputs) {
        this._updatePhysics(inputs);
        this._updateVisuals();
        this._enforceBoundaries();
    }
    
    _updatePhysics(inputs) {
        // Store previous angle for drift detection
        this.state.previousAngle = this.state.angle;
        
        // 1. Handle acceleration
        const currentMaxSpeed = inputs.boost ? CONFIG.boostSpeed : CONFIG.maxSpeed;
        const currentAcceleration = inputs.drift ? CONFIG.driftModeAcceleration : CONFIG.acceleration;
        
        if (inputs.up) {
            this.state.vx += Math.sin(this.state.angle) * currentAcceleration;
            this.state.vz += Math.cos(this.state.angle) * currentAcceleration;
        }
        if (inputs.down) {
            this.state.vx -= Math.sin(this.state.angle) * currentAcceleration;
            this.state.vz -= Math.cos(this.state.angle) * currentAcceleration;
        }

        // 2. Calculate speed
        this.state.speed = Math.sqrt(
            this.state.vx * this.state.vx + 
            this.state.vz * this.state.vz
        );

        // 3. Steering with accumulation
        // Build up turn angle based on holding steering keys
        const maxSteerAccumulation = 3.0; // Maximum accumulated turn multiplier
        const steerBuildRate = 0.05;      // How fast steering accumulates
        const steerDecayRate = 0.15;      // How fast it decays when not turning
        
        if (this.state.speed > CONFIG.gripThreshold) {
            const direction = (
                this.state.vx * Math.sin(this.state.angle) + 
                this.state.vz * Math.cos(this.state.angle)
            ) > 0 ? 1 : -1;
            
            if (inputs.left) {
                // Accumulate steering input
                this.state.steerAccumulator = Math.min(
                    this.state.steerAccumulator + steerBuildRate, 
                    maxSteerAccumulation
                );
                const turnAmount = CONFIG.turnSpeed * direction * (1 + this.state.steerAccumulator);
                this.state.angle += turnAmount;
                this._setWheelAngle(0.4);
            } else if (inputs.right) {
                // Accumulate steering input
                this.state.steerAccumulator = Math.min(
                    this.state.steerAccumulator + steerBuildRate, 
                    maxSteerAccumulation
                );
                const turnAmount = CONFIG.turnSpeed * direction * (1 + this.state.steerAccumulator);
                this.state.angle -= turnAmount;
                this._setWheelAngle(-0.4);
            } else {
                // Decay steering accumulator when not turning
                this.state.steerAccumulator = Math.max(
                    this.state.steerAccumulator - steerDecayRate, 
                    0
                );
                this._setWheelAngle(0);
            }
        } else {
            // Decay at low speed
            this.state.steerAccumulator = Math.max(
                this.state.steerAccumulator - steerDecayRate, 
                0
            );
            this._setWheelAngle(
                inputs.left ? 0.4 : (inputs.right ? -0.4 : 0)
            );
        }

        // 4. Apply drift physics (ice effect)
        this._applyDrift(inputs);

        // 5. Apply friction with drift penalty
        // Higher drift angle = more speed loss
        const driftAnglePenalty = this.state.steerAccumulator * 0.008; // 0.8% per accumulator point
        const effectiveFriction = CONFIG.friction - driftAnglePenalty;
        
        this.state.vx *= effectiveFriction;
        this.state.vz *= effectiveFriction;

        // 6. Cap speed
        if (this.state.speed > currentMaxSpeed) {
            const ratio = currentMaxSpeed / this.state.speed;
            this.state.vx *= ratio;
            this.state.vz *= ratio;
        }

        // 7. Update position
        this.state.x += this.state.vx;
        this.state.z += this.state.vz;
        
        // 8. Calculate angle delta (how much we're turning)
        this.state.angleDelta = Math.abs(this.state.angle - this.state.previousAngle);
    }
    
    _applyDrift(inputs) {
        const vMag = Math.sqrt(
            this.state.vx * this.state.vx + 
            this.state.vz * this.state.vz
        );
        
        if (vMag > 0.01) {
            // Normalized velocity vector
            const nx = this.state.vx / vMag;
            const nz = this.state.vz / vMag;
            
            // Target vector (where the car is facing)
            const tx = Math.sin(this.state.angle);
            const tz = Math.cos(this.state.angle);

            // Calculate speed-based drift factor (faster = more drift)
            // Higher speed reduces grip, causing more sliding
            const speedInfluence = Math.min(vMag / CONFIG.maxSpeed, 1.0); // Normalize to 0-1
            const speedDriftReduction = speedInfluence * CONFIG.driftSpeedFactor;
            
            // Use different drift factor when drift mode is active
            let baseDriftFactor = inputs.drift ? CONFIG.driftModeFactor : CONFIG.driftFactor;
            
            // Apply speed-based drift reduction (lower = more drift)
            const currentDriftFactor = baseDriftFactor - speedDriftReduction;

            // Interpolate current direction towards target direction
            const blendedX = nx * currentDriftFactor + tx * (1 - currentDriftFactor);
            const blendedZ = nz * currentDriftFactor + tz * (1 - currentDriftFactor);
            
            // Re-normalize
            const blendedMag = Math.sqrt(blendedX * blendedX + blendedZ * blendedZ);
            
            // Apply back to velocity
            this.state.vx = (blendedX / blendedMag) * vMag;
            this.state.vz = (blendedZ / blendedMag) * vMag;
        }
    }
    
    _setWheelAngle(angle) {
        this.wheels.frontLeft.rotation.y = angle;
        this.wheels.frontRight.rotation.y = angle;
    }
    
    _updateVisuals() {
        this.group.position.set(this.state.x, 0, this.state.z);
        this.group.rotation.y = this.state.angle;
    }
    
    _enforceBoundaries() {
        const limit = CONFIG.groundSize / 2;
        
        if (this.state.x > limit || this.state.x < -limit) {
            this.state.x = this.state.x > limit ? limit : -limit;
            this.state.vx *= -CONFIG.bounceCoefficient;
        }
        if (this.state.z > limit || this.state.z < -limit) {
            this.state.z = this.state.z > limit ? limit : -limit;
            this.state.vz *= -CONFIG.bounceCoefficient;
        }
    }
    
    getPosition() {
        return { x: this.state.x, z: this.state.z };
    }
    
    getAngle() {
        return this.state.angle;
    }
    
    getSpeed() {
        return this.state.speed;
    }
    
    getAngleDelta() {
        return this.state.angleDelta;
    }
    
    getVelocity() {
        return { vx: this.state.vx, vz: this.state.vz };
    }
}

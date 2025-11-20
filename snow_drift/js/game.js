import * as THREE from 'three';
import { CONFIG } from './config.js';
import { InputManager } from './input.js';
import { Car } from './car.js';
import { Environment } from './environment.js';
import { SnowParticles, TrailParticles } from './particles.js';

/**
 * Main Game Class
 * Orchestrates all game systems and the main game loop
 */
export class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.inputManager = null;
        this.car = null;
        this.environment = null;
        this.snowParticles = null;
        this.trailParticles = null;
        this.speedometerElement = null;
        this.scoreElement = null;
        this.score = 0;
        
        this._init();
    }
    
    _init() {
        this._setupScene();
        this._setupCamera();
        this._setupRenderer();
        this._setupGameSystems();
        this._setupEventListeners();
        this._start();
    }
    
    _setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.skyColor);
        this.scene.fog = new THREE.FogExp2(CONFIG.skyColor, CONFIG.fogDensity);
    }
    
    _setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.cameraFOV,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
    }
    
    _setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);
    }
    
    _setupGameSystems() {
        // Initialize all game systems
        this.inputManager = new InputManager();
        this.environment = new Environment(this.scene);
        this.car = new Car(this.scene);
        this.snowParticles = new SnowParticles(this.scene);
        this.trailParticles = new TrailParticles(this.scene);
        
        // Get UI elements
        this.speedometerElement = document.getElementById('speedometer');
        this.scoreElement = document.getElementById('score-value');
    }
    
    _setupEventListeners() {
        window.addEventListener('resize', () => this._onWindowResize());
    }
    
    _onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    _start() {
        this._animate();
    }
    
    _animate() {
        requestAnimationFrame(() => this._animate());
        
        this._update();
        this._render();
    }
    
    _update() {
        const inputs = this.inputManager.getInputs();
        
        // Update car physics
        this.car.update(inputs);
        
        // Update camera to follow car
        this._updateCamera();
        
        // Update particle systems
        const carPosition = this.car.getPosition();
        this.snowParticles.update(carPosition);
        
        const carState = {
            x: carPosition.x,
            z: carPosition.z,
            angle: this.car.getAngle(),
            speed: this.car.getSpeed(),
            isDrifting: inputs.drift
        };
        this.trailParticles.update(carState);
        
        // Update score (award points when drifting above minimum speed)
        this._updateScore(inputs.drift);
        
        // Update UI
        this._updateSpeedometer();
    }
    
    _updateCamera() {
        const carPosition = this.car.getPosition();
        const carAngle = this.car.getAngle();
        
        // Calculate ideal camera position behind the car
        const idealOffset = new THREE.Vector3(
            0, 
            CONFIG.cameraHeight, 
            -CONFIG.cameraDistance
        );
        idealOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carAngle);
        idealOffset.add(new THREE.Vector3(carPosition.x, 0, carPosition.z));

        // Smooth camera movement (lerp)
        this.camera.position.lerp(idealOffset, CONFIG.cameraLerpFactor);
        this.camera.lookAt(carPosition.x, 0, carPosition.z);
    }
    
    _updateSpeedometer() {
        const speed = this.car.getSpeed();
        const kmh = Math.round(speed * CONFIG.speedMultiplier);
        this.speedometerElement.innerText = `${kmh} km/h`;
    }
    
    _updateScore(isDrifting) {
        const speed = this.car.getSpeed();
        const kmh = Math.round(speed * CONFIG.speedMultiplier);
        const angleDelta = this.car.getAngleDelta();
        
        // Award points when drifting above minimum speed AND turning enough
        if (isDrifting && 
            kmh >= CONFIG.driftScoreMinSpeed && 
            angleDelta >= CONFIG.driftScoreMinAngle) {
            this.score += CONFIG.driftScorePerTick;
            this.scoreElement.innerText = this.score.toLocaleString();
        }
    }
    
    _render() {
        this.renderer.render(this.scene, this.camera);
    }
}

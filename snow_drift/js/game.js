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
        this.angleElement = null;
        this.timerElement = null;
        this.score = 0;
        this.timeRemaining = 30;
        this.gameStarted = false;
        this.gameOver = false;
        
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
        this.angleElement = document.getElementById('angle-value');
        this.timerElement = document.getElementById('timer-value');
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
        // Don't update if game is over
        if (this.gameOver) {
            return;
        }
        
        const inputs = this.inputManager.getInputs();
        
        // Start timer when car first moves
        const carSpeed = this.car.getSpeed();
        if (!this.gameStarted && carSpeed > 0.01) {
            this.gameStarted = true;
        }
        
        // Update timer if game has started
        if (this.gameStarted) {
            this.timeRemaining -= 1/60; // Assuming 60 FPS
            if (this.timeRemaining <= 0) {
                this.timeRemaining = 0;
                this.gameOver = true;
                this._showGameOver();
            }
        }
        
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
        this._updateDriftAngle();
        this._updateTimer();
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

            // Calculate multipliers
            const speedBonus = ((kmh - CONFIG.driftScoreMinSpeed) / 10) * CONFIG.driftScoreSpeedBonus;
            const angleBonus = angleDelta * CONFIG.driftScoreAngleBonus;
            const totalMultiplier = 1 + speedBonus + angleBonus;
            
            // Award points with multiplier
            const points = CONFIG.driftScorePerTick * totalMultiplier;
            this.score += points;
            this.scoreElement.innerText = Math.floor(this.score).toLocaleString();
        }
    }
    
    _updateDriftAngle() {
        const angleDelta = this.car.getAngleDelta();
        const degrees = Math.round(angleDelta * (180 / Math.PI)); // Convert radians to degrees
        this.angleElement.innerText = `${degrees}°`;
    }
    
    _updateTimer() {
        const seconds = Math.ceil(this.timeRemaining);
        this.timerElement.innerText = `${seconds}s`;
        
        // Change color when time is running low
        if (seconds <= 10) {
            this.timerElement.style.color = '#ff4444';
        } else {
            this.timerElement.style.color = 'white';
        }
    }
    
    _showGameOver() {
        const finalScore = Math.floor(this.score);
        
        // Determine Ned level
        const nedLevels = [
            { threshold: 2500, name: 'BURBERRY N TONIC', color: '#FFD700' },
            { threshold: 1500, name: 'ALL SEASON MERAPEAK', color: '#FF8C00' },
            { threshold: 750, name: 'CHECK MA NEW LACOSTE TRACKIE', color: '#4169E1' },
            { threshold: 250, name: 'BASIC BAM', color: '#90EE90' },
            { threshold: 0, name: 'NAE LEVEL', color: '#808080' }
        ];
        
        let nedLevel = nedLevels.find(level => finalScore >= level.threshold);
        
        // Create game over overlay
        const overlay = document.createElement('div');
        overlay.id = 'game-over-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        
        const gameOverText = document.createElement('h1');
        gameOverText.textContent = 'TIME\'S UP!';
        gameOverText.style.cssText = `
            color: #ff4444;
            font-size: 72px;
            font-family: monospace;
            margin-bottom: 20px;
            text-shadow: 3px 3px 0 rgba(0,0,0,0.5);
        `;
        
        const scoreText = document.createElement('div');
        scoreText.textContent = `Final Score: ${finalScore.toLocaleString()}`;
        scoreText.style.cssText = `
            color: white;
            font-size: 36px;
            font-family: monospace;
            margin-bottom: 40px;
            text-shadow: 2px 2px 0 rgba(0,0,0,0.5);
        `;
        
        // Thermometer container
        const thermometerContainer = document.createElement('div');
        thermometerContainer.style.cssText = `
            position: relative;
            width: 80px;
            height: 400px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 40px;
            margin-bottom: 30px;
            overflow: hidden;
            border: 3px solid rgba(255, 255, 255, 0.5);
        `;
        
        // Thermometer fill
        const thermometerFill = document.createElement('div');
        const maxScore = 3000;
        const fillPercentage = Math.min((finalScore / maxScore) * 100, 100);
        thermometerFill.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 0%;
            background: linear-gradient(to top, ${nedLevel.color}, ${nedLevel.color}80);
            border-radius: 40px;
            transition: height 2s ease-out;
            box-shadow: 0 0 20px ${nedLevel.color};
        `;
        
        // Level markers
        const markers = [
            { name: 'BURBERRY N TONIC', score: 2500, pos: 83.3 },
            { name: 'ALL SEASON MERAPEAK', score: 1500, pos: 50 },
            { name: 'CHECK MA NEW LACOSTE TRACKIE', score: 750, pos: 25 },
            { name: 'BASIC BAM', score: 250, pos: 8.3 }
        ];
        
        markers.forEach(marker => {
            const markerLine = document.createElement('div');
            markerLine.style.cssText = `
                position: absolute;
                right: -10px;
                bottom: ${marker.pos}%;
                width: 20px;
                height: 2px;
                background: white;
                transform: translateY(50%);
            `;
            
            const markerLabel = document.createElement('div');
            markerLabel.textContent = marker.score.toLocaleString();
            markerLabel.style.cssText = `
                position: absolute;
                right: -80px;
                bottom: ${marker.pos}%;
                transform: translateY(50%);
                color: white;
                font-size: 14px;
                font-family: monospace;
                white-space: nowrap;
            `;
            
            thermometerContainer.appendChild(markerLine);
            thermometerContainer.appendChild(markerLabel);
        });
        
        thermometerContainer.appendChild(thermometerFill);
        
        // Ned level text
        const nedLevelText = document.createElement('div');
        nedLevelText.textContent = nedLevel.name;
        nedLevelText.style.cssText = `
            color: ${nedLevel.color};
            font-size: 42px;
            font-family: monospace;
            font-weight: bold;
            margin-bottom: 30px;
            text-shadow: 2px 2px 0 rgba(0,0,0,0.5);
            text-transform: uppercase;
            opacity: 0;
            transition: opacity 1s ease-in 2s;
        `;
        
        const restartButton = document.createElement('button');
        restartButton.textContent = 'RESTART';
        restartButton.style.cssText = `
            background: #d92525;
            color: white;
            border: none;
            padding: 20px 40px;
            font-size: 24px;
            font-family: monospace;
            font-weight: bold;
            border-radius: 8px;
            cursor: pointer;
            text-shadow: 1px 1px 0 rgba(0,0,0,0.5);
            opacity: 0;
            transition: opacity 0.5s ease-in 2.5s;
        `;
        restartButton.onmouseover = () => {
            restartButton.style.background = '#ff3333';
        };
        restartButton.onmouseout = () => {
            restartButton.style.background = '#d92525';
        };
        restartButton.onclick = () => {
            window.location.reload();
        };
        
        overlay.appendChild(gameOverText);
        overlay.appendChild(scoreText);
        overlay.appendChild(thermometerContainer);
        overlay.appendChild(nedLevelText);
        overlay.appendChild(restartButton);
        document.body.appendChild(overlay);
        
        // Trigger animations
        setTimeout(() => {
            thermometerFill.style.height = `${fillPercentage}%`;
            nedLevelText.style.opacity = '1';
            restartButton.style.opacity = '1';
        }, 100);
    }
    
    _render() {
        this.renderer.render(this.scene, this.camera);
    }
}

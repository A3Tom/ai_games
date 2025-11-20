import * as THREE from 'three';
import { CONFIG } from './config.js';
import { InputManager } from './input.js';
import { Car } from './car.js';
import { Environment } from './environment.js';
import { SnowParticles, TrailParticles } from './particles.js';
import { PickupManager } from './pickups.js';

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
        this.pickupManager = null;
        this.speedometerElement = null;
        this.scoreElement = null;
        this.angleElement = null;
        this.timerElement = null;
        this.highScoreElement = null;
        this.score = 0;
        this.highScore = this._loadHighScore();
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
        this.pickupManager = new PickupManager(this.scene);
        
        // Get UI elements
        this.speedometerElement = document.getElementById('speedometer');
        this.scoreElement = document.getElementById('score-value');
        this.angleElement = document.getElementById('angle-value');
        this.timerElement = document.getElementById('timer-value');
        
        // Setup high score display
        this._setupHighScoreDisplay();
    }
    
    _loadHighScore() {
        const saved = localStorage.getItem('snowDriftHighScore');
        return saved ? parseInt(saved, 10) : 0;
    }
    
    _saveHighScore(score) {
        localStorage.setItem('snowDriftHighScore', score.toString());
    }
    
    _setupHighScoreDisplay() {
        // Only show high score if one exists
        if (this.highScore > 0) {
            const highScoreContainer = document.createElement('div');
            highScoreContainer.id = 'high-score';
            highScoreContainer.style.cssText = `
                position: absolute;
                top: 120px;
                right: 20px;
                color: white;
                font-size: 18px;
                font-weight: bold;
                text-shadow: 2px 2px 0 rgba(0,0,0,0.5);
                font-family: monospace;
                background: rgba(0, 0, 0, 0.5);
                padding: 10px 15px;
                border-radius: 8px;
            `;
            
            const label = document.createElement('div');
            label.textContent = 'HIGH SCORE';
            label.style.cssText = `
                font-size: 12px;
                color: #FFD700;
                margin-bottom: 5px;
            `;
            
            const value = document.createElement('div');
            value.id = 'high-score-value';
            value.textContent = this.highScore.toLocaleString();
            value.style.cssText = `
                font-size: 24px;
                color: #FFD700;
            `;
            
            highScoreContainer.appendChild(label);
            highScoreContainer.appendChild(value);
            document.body.appendChild(highScoreContainer);
            
            this.highScoreElement = value;
        }
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
        
        // Update pickups
        this.pickupManager.update(carPosition);
        
        // Check for pickup collisions
        const collisions = this.pickupManager.checkCollisions(carPosition);
        
        // Handle Buckfast bottle collections (positive points)
        if (collisions.bottles.length > 0) {
            collisions.bottles.forEach(() => {
                this.score += CONFIG.pickupScoreValue;
                this._showScorePopup(`+${CONFIG.pickupScoreValue}`, carPosition, '#FFD700');
                this._updateHighScore();
            });
        }
        
        // Handle police hat collections (negative points)
        if (collisions.hats.length > 0) {
            collisions.hats.forEach(() => {
                this.score = Math.max(0, this.score - CONFIG.policeHatPenalty);
                this._showScorePopup(`-${CONFIG.policeHatPenalty}`, carPosition, '#FF0000');
            });
        }
        
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
            let totalMultiplier = 1 + speedBonus + angleBonus;
            
            const isDoingDonuts = kmh == 23 && angleDelta == 0.8;
            // Reduce score significantly if doing donuts (stationary spinning)
            if (isDoingDonuts) {
                totalMultiplier *= 0.15; // Only 15% of normal score for donuts
            }
            
            // Award points with multiplier
            const points = CONFIG.driftScorePerTick * totalMultiplier;
            this.score += points;
            this.scoreElement.innerText = Math.floor(this.score).toLocaleString();
            this._updateHighScore();
        }
    }
    
    _updateHighScore() {
        const currentScore = Math.floor(this.score);
        if (currentScore > this.highScore) {
            this.highScore = currentScore;
            if (this.highScoreElement) {
                this.highScoreElement.textContent = this.highScore.toLocaleString();
            }
        }
    }
    
    _showScorePopup(text, position, color) {
        // Create a floating score popup
        const popup = document.createElement('div');
        popup.textContent = text;
        popup.style.cssText = `
            position: fixed;
            color: ${color};
            font-size: 48px;
            font-weight: bold;
            font-family: monospace;
            text-shadow: 3px 3px 0 rgba(0,0,0,0.8), 0 0 20px ${color};
            pointer-events: none;
            z-index: 999;
            animation: scorePopup 1.5s ease-out forwards;
        `;
        
        // Add CSS animation if not already added
        if (!document.getElementById('score-popup-style')) {
            const style = document.createElement('style');
            style.id = 'score-popup-style';
            style.textContent = `
                @keyframes scorePopup {
                    0% {
                        transform: translateY(0) scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: translateY(-50px) scale(1.2);
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(-100px) scale(0.8);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Convert 3D position to screen position
        const vector = new THREE.Vector3(position.x, 2, position.z);
        vector.project(this.camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
        
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
        popup.style.transform = 'translate(-50%, -50%)';
        
        document.body.appendChild(popup);
        
        // Remove after animation completes
        setTimeout(() => {
            popup.remove();
        }, 1500);
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
        
        // Save high score
        if (finalScore > this._loadHighScore()) {
            this._saveHighScore(finalScore);
        }
        
        // Determine Ned level
        const nedLevels = [
            { threshold: 2000, name: 'A god amungst the neds, burberry cap on n tonic in hand. Yeev made it.', color: '#FFD700' },
            { threshold: 1500, name: 'Approachin the top of the tonic totem pole, a classic merapeak is yours', color: '#FF8C00' },
            { threshold: 750, name: 'You\'ve earned a class new trackie top!', color: '#4169E1' },
            { threshold: 250, name: 'Yer just a basic wee bam, get sliding about the carparks', color: '#90EE90' },
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
        
        // Check if this is a new high score
        const isNewHighScore = finalScore > this._loadHighScore();
        let highScoreText = null;
        
        if (isNewHighScore) {
            highScoreText = document.createElement('div');
            highScoreText.textContent = '🏆 NEW HIGH SCORE! 🏆';
            highScoreText.style.cssText = `
                color: #FFD700;
                font-size: 42px;
                font-family: monospace;
                font-weight: bold;
                margin-bottom: 20px;
                text-shadow: 3px 3px 0 rgba(0,0,0,0.5), 0 0 30px #FFD700;
                animation: highScorePulse 1s infinite;
            `;
            
            // Add pulsing animation
            if (!document.getElementById('high-score-pulse-style')) {
                const style = document.createElement('style');
                style.id = 'high-score-pulse-style';
                style.textContent = `
                    @keyframes highScorePulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        // Buckfast bottle container (wrapper for label positioning)
        const bottleWrapper = document.createElement('div');
        bottleWrapper.style.cssText = `
            position: relative;
            display: flex;
            align-items: center;
            margin-bottom: 30px;
        `;
        
        // Buckfast bottle (thermometer styled as tonic wine bottle)
        const thermometerContainer = document.createElement('div');
        thermometerContainer.style.cssText = `
            position: relative;
            width: 100px;
            height: 450px;
            background: linear-gradient(to right, #1a0d00, #3d2000, #1a0d00);
            border-radius: 10px 10px 15px 15px;
            margin: 0 20px;
            overflow: hidden;
            border: 4px solid #8B4513;
            box-shadow: inset -5px 0 10px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.8);
        `;
        
        // Bottle neck
        const bottleNeck = document.createElement('div');
        bottleNeck.style.cssText = `
            position: absolute;
            top: -30px;
            left: 50%;
            transform: translateX(-50%);
            width: 30px;
            height: 35px;
            background: linear-gradient(to right, #1a0d00, #3d2000, #1a0d00);
            border: 3px solid #8B4513;
            border-bottom: none;
            border-radius: 5px 5px 0 0;
        `;
        
        // Bottle cap
        const bottleCap = document.createElement('div');
        bottleCap.style.cssText = `
            position: absolute;
            top: -40px;
            left: 50%;
            transform: translateX(-50%);
            width: 35px;
            height: 12px;
            background: #FFD700;
            border: 2px solid #B8860B;
            border-radius: 3px 3px 0 0;
        `;
        
        // Buckfast label (like the iconic yellow label)
        const buckfastLabel = document.createElement('div');
        buckfastLabel.textContent = 'The tonic';
        buckfastLabel.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-90deg);
            background: #FFD700;
            color: #8B0000;
            padding: 8px 15px;
            font-family: serif;
            font-weight: bold;
            font-size: 14px;
            border: 2px solid #8B0000;
            letter-spacing: 2px;
            z-index: 1;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        `;
        
        // Tonic wine fill
        const thermometerFill = document.createElement('div');
        const maxScore = 2000;
        const fillPercentage = Math.min((finalScore / maxScore) * 100, 100);
        thermometerFill.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 0%;
            background: linear-gradient(to top, #8B0000, #DC143C, #8B0000);
            transition: height 2s ease-out;
            box-shadow: 0 0 20px rgba(220, 20, 60, 0.6);
        `;
        
        // Level markers with names
        const markers = [
            { name: 'BASIC BAM', score: 250, pos: 8.3, color: '#90EE90' },
            { name: 'CHECK MA NEW LACOSTE TRACKIE', score: 750, pos: 25, color: '#4169E1' },
            { name: 'ALL SEASON MERAPEAK', score: 1500, pos: 50, color: '#FF8C00' },
            { name: 'BURBERRY CAP N BOTTLE A TONIC', score: 2000, pos: 83.3, color: '#FFD700' },
        ];
        
        markers.forEach((marker, index) => {
            // Marker line
            const markerLine = document.createElement('div');
            markerLine.style.cssText = `
                position: absolute;
                left: -15px;
                bottom: ${marker.pos}%;
                width: 25px;
                height: 3px;
                background: white;
                transform: translateY(50%);
                z-index: 2;
            `;
            
            // Score label (left side)
            const markerScore = document.createElement('div');
            markerScore.textContent = marker.score.toLocaleString();
            markerScore.style.cssText = `
                position: absolute;
                left: -80px;
                bottom: ${marker.pos}%;
                transform: translateY(50%);
                color: white;
                font-size: 16px;
                font-family: monospace;
                font-weight: bold;
                white-space: nowrap;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            `;
            
            thermometerContainer.appendChild(markerLine);
            thermometerContainer.appendChild(markerScore);
        });
        
        // Level names on the right
        const levelLabelsContainer = document.createElement('div');
        levelLabelsContainer.style.cssText = `
            display: flex;
            flex-direction: column-reverse;
            justify-content: space-between;
            height: 450px;
            margin-left: 20px;
        `;
        
        markers.forEach(marker => {
            const levelLabel = document.createElement('div');
            levelLabel.textContent = marker.name;
            levelLabel.style.cssText = `
                color: ${marker.color};
                font-size: 16px;
                font-family: monospace;
                font-weight: bold;
                white-space: nowrap;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
                padding: 5px 0;
                text-align: left;
            `;
            levelLabelsContainer.appendChild(levelLabel);
        });
        
        thermometerContainer.appendChild(bottleNeck);
        thermometerContainer.appendChild(bottleCap);
        thermometerContainer.appendChild(buckfastLabel);
        thermometerContainer.appendChild(thermometerFill);
        
        bottleWrapper.appendChild(thermometerContainer);
        bottleWrapper.appendChild(levelLabelsContainer);
        
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
        if (highScoreText) {
            overlay.appendChild(highScoreText);
        }
        overlay.appendChild(bottleWrapper);
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

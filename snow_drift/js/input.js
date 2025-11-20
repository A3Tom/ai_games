import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Input Manager
 * Handles keyboard input and provides a clean interface for querying input state
 */
export class InputManager {
    constructor() {
        this.inputs = {
            up: false,
            down: false,
            left: false,
            right: false,
            boost: false,
            drift: false
        };
        
        this._setupEventListeners();
    }
    
    _setupEventListeners() {
        window.addEventListener('keydown', (e) => this._handleKeyDown(e));
        window.addEventListener('keyup', (e) => this._handleKeyUp(e));
    }
    
    _handleKeyDown(e) {
        switch(e.key.toLowerCase()) {
            case 'w': 
            case 'arrowup': 
                this.inputs.up = true; 
                break;
            case 's': 
            case 'arrowdown': 
                this.inputs.down = true; 
                break;
            case 'a': 
            case 'arrowleft': 
                this.inputs.left = true; 
                break;
            case 'd': 
            case 'arrowright': 
                this.inputs.right = true; 
                break;
            case 'shift': 
                this.inputs.boost = true; 
                break;
            case ' ':
            case 'spacebar':
                this.inputs.drift = true;
                break;
        }
    }
    
    _handleKeyUp(e) {
        switch(e.key.toLowerCase()) {
            case 'w': 
            case 'arrowup': 
                this.inputs.up = false; 
                break;
            case 's': 
            case 'arrowdown': 
                this.inputs.down = false; 
                break;
            case 'a': 
            case 'arrowleft': 
                this.inputs.left = false; 
                break;
            case 'd': 
            case 'arrowright': 
                this.inputs.right = false; 
                break;
            case 'shift': 
                this.inputs.boost = false; 
                break;
            case ' ':
            case 'spacebar':
                this.inputs.drift = false;
                break;
        }
    }
    
    getInputs() {
        return this.inputs;
    }
    
    isAccelerating() {
        return this.inputs.up;
    }
    
    isBraking() {
        return this.inputs.down;
    }
    
    isTurningLeft() {
        return this.inputs.left;
    }
    
    isTurningRight() {
        return this.inputs.right;
    }
    
    isBoosting() {
        return this.inputs.boost;
    }
    
    isDrifting() {
        return this.inputs.drift;
    }
}

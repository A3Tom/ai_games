import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * Environment Class
 * Handles creation and management of the game world (ground, trees, lighting)
 */
export class Environment {
    constructor(scene) {
        this.scene = scene;
        
        this._setupLighting();
        this._createGround();
        this._createTrees();
    }
    
    _setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, CONFIG.ambientLightIntensity);
        this.scene.add(ambientLight);

        // Directional light (sun)
        const dirLight = new THREE.DirectionalLight(0xffffee, CONFIG.directionalLightIntensity);
        dirLight.position.set(100, 100, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.camera.left = -100;
        dirLight.shadow.camera.right = 100;
        dirLight.shadow.camera.top = 100;
        dirLight.shadow.camera.bottom = -100;
        this.scene.add(dirLight);
    }
    
    _createGround() {
        // Snow-covered ground
        const groundGeo = new THREE.PlaneGeometry(CONFIG.groundSize, CONFIG.groundSize);
        const groundMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            roughness: 1,
            metalness: 0 
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid helper (visual aid)
        const gridHelper = new THREE.GridHelper(
            CONFIG.groundSize, 
            40, 
            0xddeeff, 
            0xddeeff
        );
        gridHelper.position.y = 0.05;
        gridHelper.material.opacity = CONFIG.gridOpacity;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
    }
    
    _createTrees() {
        // Tree geometries and materials
        const treeGeo = new THREE.ConeGeometry(2, 8, 8);
        const treeMat = new THREE.MeshStandardMaterial({ 
            color: CONFIG.treeColor, 
            roughness: 0.8 
        });
        const trunkGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
        const trunkMat = new THREE.MeshStandardMaterial({ color: CONFIG.trunkColor });

        // Generate random trees, keeping center clear
        for (let i = 0; i < CONFIG.treeCount; i++) {
            const x = (Math.random() - 0.5) * CONFIG.groundSize * 0.9;
            const z = (Math.random() - 0.5) * CONFIG.groundSize * 0.9;
            
            // Keep center area clear for driving
            if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;

            this._createTree(x, z, treeGeo, treeMat, trunkGeo, trunkMat);
        }
    }
    
    _createTree(x, z, treeGeo, treeMat, trunkGeo, trunkMat) {
        const group = new THREE.Group();
        
        // Trunk
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1;
        trunk.castShadow = true;
        group.add(trunk);

        // Leaves
        const leaves = new THREE.Mesh(treeGeo, treeMat);
        leaves.position.y = 5;
        leaves.castShadow = true;
        group.add(leaves);

        // Snow cap on top
        const snowCapGeo = new THREE.ConeGeometry(1.5, 3, 8);
        const snowCapMat = new THREE.MeshBasicMaterial({ color: CONFIG.snowCapColor });
        const snowCap = new THREE.Mesh(snowCapGeo, snowCapMat);
        snowCap.position.y = 6.5;
        group.add(snowCap);

        // Position and add variation
        group.position.set(x, 0, z);
        const scale = 0.8 + Math.random() * 0.6;
        group.scale.set(scale, scale, scale);
        
        this.scene.add(group);
    }
}

import * as THREE from 'three';

/**
 * Factory class for creating game entities (Three.js Meshes).
 * Handles geometry and material creation to keep main game logic clean.
 */
export class EntityFactory {
    
    static createEarth(radius) {
        const geometry = new THREE.SphereGeometry(radius, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            emissive: 0x002244, // Slight internal glow to act as "the light"
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.7,
            roughness: 0.9, // Matte surface to prevent sun glare
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        return new THREE.Mesh(geometry, material);
    }

    static createAtmosphere(radius) {
        const geometry = new THREE.SphereGeometry(radius * 1.03, 64, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide
        });
        return new THREE.Mesh(geometry, material);
    }

    static createSnakeHead() {
        const geometry = new THREE.BoxGeometry(0.8, 0.4, 0.8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00, 
            emissive: 0x004400 
        });
        return new THREE.Mesh(geometry, material);
    }

    static createFood() {
        const geometry = new THREE.SphereGeometry(0.5, 16, 16);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffaa00, 
            emissive: 0xff0000, 
            emissiveIntensity: 0.5 
        });
        return new THREE.Mesh(geometry, material);
    }

    static createSnakeSegment(color) {
        const geometry = new THREE.BoxGeometry(0.6, 0.3, 0.6);
        const material = new THREE.MeshStandardMaterial({ color: color });
        return new THREE.Mesh(geometry, material);
    }

    static createBonusFood() {
        const geometry = new THREE.SphereGeometry(0.25, 8, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffff00, 
            emissive: 0xffaa00,
            emissiveIntensity: 0.5 
        });
        return new THREE.Mesh(geometry, material);
    }
}
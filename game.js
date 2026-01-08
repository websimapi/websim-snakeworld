import * as THREE from 'three';
import { getTangentDirection, getRandomPointOnSphere } from './math-utils.js';

export class Game {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        // Constants
        this.EARTH_RADIUS = 10;
        this.SNAKE_SPEED = 8.0; // Units per second
        this.TURN_SPEED = 6.0;
        this.SEGMENT_DISTANCE = 0.8;
        this.STARTING_SEGMENTS = 5;
        
        // State
        this.isPlaying = false;
        this.isGameOver = false;
        this.score = 0;
        this.time = 0;
        
        // Entities
        this.earth = null;
        this.head = null;
        this.segments = []; // Array of mesh objects
        this.pathHistory = []; // { pos: Vector3, quat: Quaternion }
        this.food = null;
        
        // Movement
        this.currentDir = new THREE.Vector3(1, 0, 0); // Local tangent direction
        this.targetPoint = null; // Where the user tapped (Vector3)
        
        // Audio
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
        
        this.init();
    }
    
    async loadSound(name, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            this.sounds[name] = audioBuffer;
        } catch (e) {
            console.error('Error loading sound:', name, e);
        }
    }

    playSound(name) {
        if (this.sounds[name] && this.audioCtx.state === 'running') {
            const source = this.audioCtx.createBufferSource();
            source.buffer = this.sounds[name];
            source.connect(this.audioCtx.destination);
            source.start(0);
        }
    }

    init() {
        // Load sounds
        this.loadSound('eat', './snake_eat.mp3');
        this.loadSound('die', './game_over.mp3');

        // Create Earth
        const geometry = new THREE.SphereGeometry(this.EARTH_RADIUS, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
            roughness: 0.1,
            metalness: 0.1
        });
        this.earth = new THREE.Mesh(geometry, material);
        this.scene.add(this.earth);
        
        // Atmosphere glow (simplified)
        const atmGeometry = new THREE.SphereGeometry(this.EARTH_RADIUS * 1.03, 64, 64);
        const atmMaterial = new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.1,
            side: THREE.BackSide
        });
        this.scene.add(new THREE.Mesh(atmGeometry, atmMaterial));

        // Create Snake Head
        const headGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x004400 });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.set(0, this.EARTH_RADIUS, 0); // Start at North Pole area
        this.scene.add(this.head);

        // Initialize Food
        const foodGeo = new THREE.SphereGeometry(0.5, 16, 16);
        const foodMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff0000, emissiveIntensity: 0.5 });
        this.food = new THREE.Mesh(foodGeo, foodMat);
        this.scene.add(this.food);
        this.spawnFood();

        this.resetGame();
    }
    
    resetGame() {
        // Clear segments
        this.segments.forEach(seg => this.scene.remove(seg));
        this.segments = [];
        this.pathHistory = [];
        
        // Reset Head
        this.head.position.set(0, this.EARTH_RADIUS, 0);
        this.head.lookAt(new THREE.Vector3(1, this.EARTH_RADIUS, 0));
        this.head.quaternion.identity(); // Reset rotation
        
        // Set initial direction (Tangent X)
        this.currentDir.set(1, 0, 0);
        this.targetPoint = null;
        
        this.score = 0;
        this.isGameOver = false;
        this.isPlaying = true;

        document.getElementById('score').innerText = this.score;
        document.getElementById('game-over').classList.add('hidden');
        
        // Rebuild initial body
        for(let i=0; i<this.STARTING_SEGMENTS; i++) {
            this.addSegment();
        }
        
        // Pre-fill history so segments appear behind head
        const startPos = this.head.position.clone();
        for(let i=0; i<100; i++) {
            this.pathHistory.push({
                pos: startPos.clone(),
                quat: this.head.quaternion.clone()
            });
        }
    }

    addSegment() {
        const segGeo = new THREE.BoxGeometry(0.6, 0.3, 0.6);
        // Gradient color for body
        const color = new THREE.Color().setHSL(0.3 + (this.segments.length * 0.02) % 0.5, 1.0, 0.5);
        const segMat = new THREE.MeshStandardMaterial({ color: color });
        const segment = new THREE.Mesh(segGeo, segMat);
        this.scene.add(segment);
        this.segments.push(segment);
    }

    spawnFood() {
        // Keep trying until we find a spot not too close to the snake
        let valid = false;
        let pos = new THREE.Vector3();
        let tries = 0;
        
        while(!valid && tries < 20) {
            pos = getRandomPointOnSphere(this.EARTH_RADIUS);
            valid = true;
            
            // Check distance to head
            if(pos.distanceTo(this.head.position) < 5) valid = false;
            
            // Check distance to segments (simplified check)
            for(let seg of this.segments) {
                if(pos.distanceTo(seg.position) < 2) {
                    valid = false;
                    break;
                }
            }
            tries++;
        }
        
        this.food.position.copy(pos);
        // Align food to surface normal
        this.food.lookAt(new THREE.Vector3(0,0,0));
    }

    setTarget(point) {
        if(this.isGameOver) return;
        
        // Resume context on first interaction
        if(this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        
        // Project the point onto the sphere surface to be safe
        this.targetPoint = point.clone().normalize().multiplyScalar(this.EARTH_RADIUS);
    }

    update(dt) {
        if(this.isGameOver) return;

        // 1. Parallel Transport Movement Logic
        const headPos = this.head.position.clone();
        const surfaceNormal = headPos.clone().normalize();
        
        // Get current Forward vector in World Space
        let currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
        
        // Ensure strictly tangent to avoid drift
        currentForward.projectOnPlane(surfaceNormal).normalize();

        // Steering
        if (this.targetPoint) {
            const dist = headPos.distanceTo(this.targetPoint);
            if (dist < 1.0) {
                this.targetPoint = null; // Reached target, keep going straight
            } else {
                // Determine direction to target
                const desiredTangent = getTangentDirection(headPos, this.targetPoint, new THREE.Vector3(0,0,0));
                
                // Steer current forward towards desired tangent
                // Using lerp provides a smooth turn
                currentForward.lerp(desiredTangent, this.TURN_SPEED * dt).normalize();
                
                // We need to update the orientation (quaternion) to match this new 'currentForward'
                // while keeping the same 'surfaceNormal' as Up.
                const m = new THREE.Matrix4().lookAt(currentForward.clone().add(headPos), headPos, surfaceNormal);
                this.head.quaternion.setFromRotationMatrix(m);
            }
        } else {
            // Ensure orientation is clean (Forward aligns with tangent)
            const m = new THREE.Matrix4().lookAt(currentForward.clone().add(headPos), headPos, surfaceNormal);
            this.head.quaternion.setFromRotationMatrix(m);
        }

        // 2. Move Head Forward (Parallel Transport)
        const moveDist = this.SNAKE_SPEED * dt;
        const angularSpeed = moveDist / this.EARTH_RADIUS;
        
        // Axis of rotation is perpendicular to both Normal and Forward (i.e., Right vector)
        // axis = normal x forward
        const rotationAxis = new THREE.Vector3().crossVectors(surfaceNormal, currentForward).normalize();
        
        // Create rotation quaternion
        const qRot = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angularSpeed);
        
        // Apply rotation to Position
        this.head.position.applyQuaternion(qRot);
        
        // Apply rotation to Orientation (transport the frame)
        this.head.quaternion.premultiply(qRot);

        // 3. Record History for segments
        // We only record if we moved enough to smooth out the trail
        if (this.pathHistory.length === 0 || 
            this.pathHistory[0].pos.distanceTo(this.head.position) > 0.1) {
            
            this.pathHistory.unshift({
                pos: this.head.position.clone(),
                quat: this.head.quaternion.clone()
            });
            
            // Limit history size
            const maxHistory = (this.segments.length + 2) * (this.SEGMENT_DISTANCE * 10);
            if(this.pathHistory.length > maxHistory) {
                this.pathHistory.length = Math.floor(maxHistory);
            }
        }

        // 4. Update Segments
        let distanceAccumulator = 0;
        let historyIndex = 0;
        
        for (let i = 0; i < this.segments.length; i++) {
            const segment = this.segments[i];
            const targetDist = (i + 1) * this.SEGMENT_DISTANCE;
            
            // Find position in history that matches target distance
            while(historyIndex < this.pathHistory.length - 1) {
                const p1 = this.pathHistory[historyIndex].pos;
                const p2 = this.pathHistory[historyIndex + 1].pos;
                const d = p1.distanceTo(p2);
                
                if (distanceAccumulator + d >= targetDist) {
                    // Interpolate
                    const remainder = targetDist - distanceAccumulator;
                    const alpha = remainder / d;
                    
                    segment.position.lerpVectors(p1, p2, alpha);
                    segment.quaternion.slerpQuaternions(this.pathHistory[historyIndex].quat, this.pathHistory[historyIndex+1].quat, alpha);
                    break;
                }
                
                distanceAccumulator += d;
                historyIndex++;
            }
        }

        // 5. Collision Check: Food
        if (this.head.position.distanceTo(this.food.position) < 1.5) {
            this.playSound('eat');
            this.score += 10;
            document.getElementById('score').innerText = this.score;
            this.addSegment();
            this.spawnFood();
        }

        // 6. Collision Check: Self
        // Skip first few segments to avoid hitting own neck
        for(let i = 4; i < this.segments.length; i++) {
            if (this.head.position.distanceTo(this.segments[i].position) < 0.6) {
                this.gameOver();
                break;
            }
        }
        
        // 7. Pulse Food
        this.food.scale.setScalar(1 + Math.sin(Date.now() * 0.01) * 0.2);
    }

    gameOver() {
        this.isGameOver = true;
        this.playSound('die');
        document.getElementById('game-over').classList.remove('hidden');
        this.isPlaying = false;
    }
}
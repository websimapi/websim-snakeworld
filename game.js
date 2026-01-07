import * as THREE from 'three';
import { getTangentDirection, getRandomPointOnSphere } from './math-utils.js';
import { RemoteSnake } from './remote-snake.js';

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
        this.isPlaying = false; // "Playing" means alive and controlling snake
        this.isInLobby = true;  // "Lobby" means spectating title screen
        this.isGameOver = false;
        this.score = 0;
        this.time = 0;
        
        // Entities
        this.earth = null;
        this.head = null;
        this.segments = []; // Array of mesh objects
        this.pathHistory = []; // { pos: Vector3, quat: Quaternion }
        this.food = null;
        
        // Multiplayer
        this.room = new WebsimSocket();
        this.remoteSnakes = {}; // id -> RemoteSnake
        this.playerHue = Math.random();
        
        // Movement
        this.currentDir = new THREE.Vector3(1, 0, 0); // Local tangent direction
        this.targetPoint = null; // Where the user tapped (Vector3)
        
        // Audio
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
        this.initialized = false;
        
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

    async init() {
        await this.room.initialize();
        
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
        const headMat = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color().setHSL(this.playerHue, 1.0, 0.5), 
            emissive: new THREE.Color().setHSL(this.playerHue, 1.0, 0.2) 
        });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.head.position.set(0, this.EARTH_RADIUS, 0); // Start at North Pole area
        this.head.visible = false; // Hidden in lobby
        this.scene.add(this.head);

        // Initialize Food (Local visual only, for now)
        const foodGeo = new THREE.SphereGeometry(0.5, 16, 16);
        const foodMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff0000, emissiveIntensity: 0.5 });
        this.food = new THREE.Mesh(foodGeo, foodMat);
        this.scene.add(this.food);
        this.spawnFood();

        this.enterLobby();
        this.initialized = true;
    }
    
    enterLobby() {
        this.isInLobby = true;
        this.isPlaying = false;
        this.head.visible = false;
        
        // Hide local segments
        this.segments.forEach(s => s.visible = false);
        
        // Reset UI
        document.getElementById('start-message').style.display = 'block';
        document.getElementById('start-message').innerText = "Tap to Join";
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('score').style.display = 'none';

        // Update presence to lobby mode
        this.room.updatePresence({ status: 'lobby' });
    }
    
    startGame() {
        // Clear old state
        this.segments.forEach(seg => this.scene.remove(seg));
        this.segments = [];
        this.pathHistory = [];
        
        // Reset Head
        const startPoint = getRandomPointOnSphere(this.EARTH_RADIUS);
        this.head.position.copy(startPoint);
        this.head.lookAt(new THREE.Vector3(0,0,0)); // temporary to get 'up' right
        this.head.lookAt(startPoint.clone().add(new THREE.Vector3(1,1,1))); // Random orientation
        
        // Project tangent
        const surfaceNormal = this.head.position.clone().normalize();
        const randomDir = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5);
        const tangent = randomDir.sub(surfaceNormal.multiplyScalar(randomDir.dot(surfaceNormal))).normalize();
        
        const m = new THREE.Matrix4().lookAt(this.head.position.clone().add(tangent), this.head.position, surfaceNormal);
        this.head.quaternion.setFromRotationMatrix(m);
        
        this.targetPoint = null;
        this.score = 0;
        this.isGameOver = false;
        this.isPlaying = true;
        this.isInLobby = false;
        
        this.head.visible = true;

        document.getElementById('score').style.display = 'block';
        document.getElementById('score').innerText = this.score;
        document.getElementById('game-over').classList.add('hidden');
        document.getElementById('start-message').style.display = 'none';
        
        // Rebuild initial body
        for(let i=0; i<this.STARTING_SEGMENTS; i++) {
            this.addSegment();
        }
        
        // Pre-fill history
        const startPos = this.head.position.clone();
        for(let i=0; i<100; i++) {
            this.pathHistory.push({
                pos: startPos.clone(),
                quat: this.head.quaternion.clone()
            });
        }

        // Resume audio context
        if(this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    addSegment() {
        const segGeo = new THREE.BoxGeometry(0.6, 0.3, 0.6);
        // Gradient color for body
        const color = new THREE.Color().setHSL(this.playerHue, 1.0, 0.5 - ((this.segments.length * 0.02) % 0.5));
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
        if(this.isInLobby) {
            this.startGame();
            return;
        }
        if(this.isGameOver) return;
        
        // Project the point onto the sphere surface to be safe
        this.targetPoint = point.clone().normalize().multiplyScalar(this.EARTH_RADIUS);
    }

    update(dt) {
        if (!this.initialized) return;

        // --- Multiplayer Sync ---
        // Render remote snakes
        const peers = this.room.presence || {};
        const activeIds = new Set();
        
        for (const [id, data] of Object.entries(peers)) {
            if (id === this.room.clientId) continue; // Skip self
            if (data.status !== 'playing') continue; // Skip lobby players
            
            activeIds.add(id);
            
            if (!this.remoteSnakes[id]) {
                this.remoteSnakes[id] = new RemoteSnake(this.scene, id, data.hue);
            }
            this.remoteSnakes[id].update(data, dt);
        }
        
        // Cleanup disconnected or non-playing snakes
        for (const id of Object.keys(this.remoteSnakes)) {
            if (!activeIds.has(id)) {
                this.remoteSnakes[id].dispose();
                delete this.remoteSnakes[id];
            }
        }
        // ------------------------

        if(this.isInLobby || this.isGameOver) {
            // Pulse food even in lobby
            this.food.scale.setScalar(1 + Math.sin(Date.now() * 0.01) * 0.2);
            return;
        }

        // 1. Calculate movement direction
        const headPos = this.head.position.clone();
        const surfaceNormal = headPos.clone().normalize();

        // If we have a target, steer towards it
        if (this.targetPoint) {
            const dist = headPos.distanceTo(this.targetPoint);
            if (dist < 0.5) {
                this.targetPoint = null; // Reached target, continue straight
            } else {
                // Get tangent direction towards target
                const desiredDir = getTangentDirection(headPos, this.targetPoint, new THREE.Vector3(0,0,0));
                
                // Get current forward vector (projected onto tangent plane to be safe)
                let currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
                
                // Smoothly interpolate current forward towards desired direction
                // We use lerp on the vector, then re-normalize
                currentForward.lerp(desiredDir, this.TURN_SPEED * dt).normalize();
                
                // Re-orient the head quaternion
                // Create a matrix that looks at 'currentForward' with 'surfaceNormal' as UP
                const m = new THREE.Matrix4().lookAt(currentForward.clone().add(headPos), headPos, surfaceNormal);
                this.head.quaternion.setFromRotationMatrix(m);
            }
        } else {
            // Just keep staying tangent to sphere
            // We need to rotate the orientation as we move around the curve
            const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
            const m = new THREE.Matrix4().lookAt(forward.clone().add(headPos), headPos, surfaceNormal);
            this.head.quaternion.setFromRotationMatrix(m);
        }

        // 2. Move Head Forward
        const moveDist = this.SNAKE_SPEED * dt;
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
        
        // Move physically
        const nextPos = headPos.clone().add(forwardDir.multiplyScalar(moveDist));
        
        // Snap back to surface
        nextPos.normalize().multiplyScalar(this.EARTH_RADIUS);
        this.head.position.copy(nextPos);

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

        // 8. Broadcast Presence
        this.room.updatePresence({
            status: 'playing',
            x: this.head.position.x,
            y: this.head.position.y,
            z: this.head.position.z,
            qx: this.head.quaternion.x,
            qy: this.head.quaternion.y,
            qz: this.head.quaternion.z,
            qw: this.head.quaternion.w,
            segments: this.segments.length,
            hue: this.playerHue
        });
    }

    gameOver() {
        this.isGameOver = true;
        this.isPlaying = false;
        this.playSound('die');
        document.getElementById('game-over').classList.remove('hidden');
        
        this.room.updatePresence({ status: 'dead' });
    }
}
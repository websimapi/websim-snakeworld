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
        this.growthPoints = 0; // Tracks points for next growth
        this.time = 0;
        
        // Bonus Spawning
        this.bonusSpawnQueue = 0;
        this.bonusSpawnDist = 0;

        // Entities
        this.earth = null;
        this.head = null;
        this.segments = []; // Array of mesh objects
        this.pathHistory = []; // { pos: Vector3, quat: Quaternion }
        this.food = null;
        this.bonusFoods = []; // Array of meshes for yellow food
        
        // Player Info
        this.playerInfo = { username: 'Player', avatarUrl: '' };

        // Replay Data
        this.replayData = [];
        this.frameEvents = []; // Store events occurring in current frame
        this.RECORD_FPS = 30;
        this.recordAccumulator = 0;
        
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
        // Record event for replay
        this.frameEvents.push(name);
    }

    setPlayerInfo(info) {
        this.playerInfo = info;
        const avatarEl = document.getElementById('player-avatar');
        const nameEl = document.getElementById('player-name');
        if(avatarEl && info.avatarUrl) avatarEl.src = info.avatarUrl;
        if(nameEl && info.username) nameEl.textContent = info.username;
    }

    init() {
        // Load sounds
        this.loadSound('eat', './snake_eat.mp3');
        this.loadSound('die', './game_over.mp3');

        // Create Earth
        const geometry = new THREE.SphereGeometry(this.EARTH_RADIUS, 64, 64);
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
        // Clear bonus foods
        this.bonusFoods.forEach(f => this.scene.remove(f));
        this.bonusFoods = [];
        
        this.pathHistory = [];
        this.replayData = []; // Clear previous recording
        this.recordAccumulator = 0;

        this.bonusSpawnQueue = 0;
        this.bonusSpawnDist = 0;
        
        // Reset Head
        this.head.position.set(0, this.EARTH_RADIUS, 0);
        this.head.lookAt(new THREE.Vector3(1, this.EARTH_RADIUS, 0));
        this.head.quaternion.identity(); // Reset rotation
        
        // Set initial direction (Tangent X)
        this.currentDir.set(1, 0, 0);
        this.targetPoint = null;

        // Reset Camera immediately
        const idealCameraPos = this.head.position.clone().normalize().multiplyScalar(30);
        this.camera.position.copy(idealCameraPos);
        this.camera.lookAt(0,0,0);
        const snakeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
        this.camera.up.copy(snakeForward);
        
        this.score = 0;
        this.growthPoints = 0;
        this.isGameOver = false;
        this.isPlaying = true;

        const scoreEl = document.getElementById('player-score');
        if(scoreEl) scoreEl.innerText = this.score;
        document.getElementById('game-over').classList.add('hidden');
        
        // Rebuild initial body
        for(let i=0; i<this.STARTING_SEGMENTS; i++) {
            this.addSegmentInternal();
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

    addSegmentInternal() {
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

    spawnBonusTrail() {
        this.bonusSpawnQueue += 5;
    }

    spawnSingleBonusFood() {
        const tail = this.segments.length > 0 ? this.segments[this.segments.length - 1] : this.head;
        const pos = tail.position.clone();

        // Create mesh
        const geo = new THREE.SphereGeometry(0.25, 8, 8);
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0xffff00, 
            emissive: 0xffaa00,
            emissiveIntensity: 0.5 
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        // Ensure it sits perfectly on surface
        mesh.position.normalize().multiplyScalar(this.EARTH_RADIUS);
        
        this.scene.add(mesh);
        this.bonusFoods.push(mesh);
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

        // 4.5 Handle Bonus Spawning
        if (this.bonusSpawnQueue > 0) {
            const moveDist = this.SNAKE_SPEED * dt;
            this.bonusSpawnDist += moveDist;
            
            const SPACING = 1.5; 
            
            while (this.bonusSpawnDist >= SPACING && this.bonusSpawnQueue > 0) {
                this.bonusSpawnDist -= SPACING;
                this.bonusSpawnQueue--;
                this.spawnSingleBonusFood();
            }
        }

        // 5. Collision Check: Food
        // Orange Food
        if (this.head.position.distanceTo(this.food.position) < 1.5) {
            this.playSound('eat');
            this.score += 5;
            this.growthPoints += 5;
            
            const scoreEl = document.getElementById('player-score');
            if(scoreEl) scoreEl.innerText = this.score;
            
            this.spawnFood();
            
            // 50% chance for bonus trail
            if (Math.random() < 0.5) {
                this.spawnBonusTrail();
            }
        }

        // Yellow Bonus Foods
        for (let i = this.bonusFoods.length - 1; i >= 0; i--) {
            const bonus = this.bonusFoods[i];
            if (this.head.position.distanceTo(bonus.position) < 1.2) {
                this.playSound('eat');
                this.score += 1;
                this.growthPoints += 1;
                
                const scoreEl = document.getElementById('player-score');
                if(scoreEl) scoreEl.innerText = this.score;

                // Remove
                this.scene.remove(bonus);
                this.bonusFoods.splice(i, 1);
            }
        }

        // Check Growth
        while (this.growthPoints >= 10) {
            this.addSegmentInternal();
            this.growthPoints -= 10;
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

        // 7.5 Update Camera (Moved from main.js for consistency)
        const idealCameraPos = this.head.position.clone().normalize().multiplyScalar(30);
        this.camera.position.lerp(idealCameraPos, 2.0 * dt);
        this.camera.lookAt(0, 0, 0);
        
        // Align up vector with snake forward to prevent orientation flipping
        const snakeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
        this.camera.up.copy(snakeForward);

        // 8. Record Frame for Replay
        this.recordAccumulator += dt;
        if (this.recordAccumulator >= 1 / this.RECORD_FPS) {
            this.recordFrame();
            this.recordAccumulator = 0; // Reset
        }
    }

    recordFrame() {
        // Snapshot current state
        const frame = {
            head: {
                pos: this.head.position.toArray(),
                quat: this.head.quaternion.toArray()
            },
            camera: {
                pos: this.camera.position.toArray(),
                quat: this.camera.quaternion.toArray(),
                up: this.camera.up.toArray()
            },
            food: this.food.position.toArray(),
            bonusFoods: this.bonusFoods.map(b => b.position.toArray()),
            segments: this.segments.map(seg => ({
                pos: seg.position.toArray(),
                quat: seg.quaternion.toArray(),
                color: seg.material.color.getHex()
            })),
            score: this.score,
            events: [...this.frameEvents]
        };
        this.replayData.push(frame);
        this.frameEvents = []; // Reset events for next frame
    }

    getReplayJSON() {
        // Clone the frames to avoid mutating the original recording
        const frames = [...this.replayData];
        
        // Add 3 seconds of padding frames at the end to show the aftermath
        if (frames.length > 0) {
            const lastFrame = frames[frames.length - 1];
            // Create a static frame copy with no events
            // We strip events to prevent the death sound from looping
            const paddingFrame = {
                ...lastFrame,
                events: []
            };
            
            const paddingFramesCount = 3 * this.RECORD_FPS; // 3 seconds padding
            for (let i = 0; i < paddingFramesCount; i++) {
                frames.push(paddingFrame);
            }
        }

        // Resolve absolute URLs for assets to ensure they work in the render context
        const getAbsoluteUrl = (path) => new URL(path, window.location.href).href;

        return {
            frames: frames,
            config: {
                earthRadius: this.EARTH_RADIUS,
                fps: this.RECORD_FPS,
                playerInfo: this.playerInfo,
                sounds: {
                    eat: getAbsoluteUrl('./snake_eat.mp3'),
                    die: getAbsoluteUrl('./game_over.mp3')
                }
            }
        };
    }

    gameOver() {
        this.isGameOver = true;
        this.playSound('die');
        this.recordFrame(); // Ensure death state and sound are recorded
        document.getElementById('game-over').classList.remove('hidden');
        this.isPlaying = false;
    }
}
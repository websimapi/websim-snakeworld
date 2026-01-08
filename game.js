import * as THREE from 'three';
import { getTangentDirection, getRandomPointOnSphere } from './math-utils.js';
import { AudioManager } from './audio-manager.js';
import { EntityFactory } from './entity-factory.js';
import { ReplaySystem } from './replay-system.js';

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
        this.RECORD_FPS = 30;
        
        // State
        this.isPlaying = false;
        this.isGameOver = false;
        this.score = 0;
        this.growthPoints = 0; // Tracks points for next growth
        this.lastDeathTime = 0; // For debounce logic
        
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

        // Subsystems
        this.audioManager = new AudioManager();
        this.replaySystem = new ReplaySystem(this.RECORD_FPS);

        // Movement
        this.currentDir = new THREE.Vector3(1, 0, 0); // Local tangent direction
        this.targetPoint = null; // Where the user tapped (Vector3)
        
        this.init();
    }

    playSound(name) {
        this.audioManager.play(name);
        this.replaySystem.logEvent(name);
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
        this.audioManager.load('eat', './snake_eat.mp3');
        this.audioManager.load('die', './game_over.mp3');

        // Create Earth
        this.earth = EntityFactory.createEarth(this.EARTH_RADIUS);
        this.scene.add(this.earth);
        
        // Atmosphere glow
        const atmosphere = EntityFactory.createAtmosphere(this.EARTH_RADIUS);
        this.scene.add(atmosphere);

        // Create Snake Head
        this.head = EntityFactory.createSnakeHead();
        this.head.position.set(0, this.EARTH_RADIUS, 0); // Start at North Pole area
        this.scene.add(this.head);

        // Initialize Food
        this.food = EntityFactory.createFood();
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
        
        this.replaySystem.reset();

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
        const color = new THREE.Color().setHSL(0.3 + (this.segments.length * 0.02) % 0.5, 1.0, 0.5);
        const segment = EntityFactory.createSnakeSegment(color);
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
        this.food.lookAt(new THREE.Vector3(0,0,0));
    }

    spawnBonusTrail() {
        this.bonusSpawnQueue += 5;
    }

    spawnSingleBonusFood() {
        const tail = this.segments.length > 0 ? this.segments[this.segments.length - 1] : this.head;
        const pos = tail.position.clone();

        const mesh = EntityFactory.createBonusFood();
        mesh.position.copy(pos);
        mesh.position.normalize().multiplyScalar(this.EARTH_RADIUS);
        
        this.scene.add(mesh);
        this.bonusFoods.push(mesh);
    }

    setTarget(point) {
        if(this.isGameOver) return;
        
        // Resume context on first interaction
        this.audioManager.resume();
        
        this.targetPoint = point.clone().normalize().multiplyScalar(this.EARTH_RADIUS);
    }

    update(dt) {
        if(this.isGameOver) return;

        // 1. Parallel Transport Movement Logic
        const headPos = this.head.position.clone();
        const surfaceNormal = headPos.clone().normalize();
        
        // Get current Forward vector in World Space
        let currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
        
        // Ensure strictly tangent
        currentForward.projectOnPlane(surfaceNormal).normalize();

        // Steering
        if (this.targetPoint) {
            const dist = headPos.distanceTo(this.targetPoint);
            if (dist < 1.0) {
                this.targetPoint = null; 
            } else {
                const desiredTangent = getTangentDirection(headPos, this.targetPoint, new THREE.Vector3(0,0,0));
                currentForward.lerp(desiredTangent, this.TURN_SPEED * dt).normalize();
                
                const m = new THREE.Matrix4().lookAt(currentForward.clone().add(headPos), headPos, surfaceNormal);
                this.head.quaternion.setFromRotationMatrix(m);
            }
        } else {
            const m = new THREE.Matrix4().lookAt(currentForward.clone().add(headPos), headPos, surfaceNormal);
            this.head.quaternion.setFromRotationMatrix(m);
        }

        // 2. Move Head Forward (Parallel Transport)
        const moveDist = this.SNAKE_SPEED * dt;
        const angularSpeed = moveDist / this.EARTH_RADIUS;
        
        const rotationAxis = new THREE.Vector3().crossVectors(surfaceNormal, currentForward).normalize();
        const qRot = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angularSpeed);
        
        this.head.position.applyQuaternion(qRot);
        this.head.quaternion.premultiply(qRot);

        // 3. Record History for segments
        if (this.pathHistory.length === 0 || 
            this.pathHistory[0].pos.distanceTo(this.head.position) > 0.1) {
            
            this.pathHistory.unshift({
                pos: this.head.position.clone(),
                quat: this.head.quaternion.clone()
            });
            
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
            
            while(historyIndex < this.pathHistory.length - 1) {
                const p1 = this.pathHistory[historyIndex].pos;
                const p2 = this.pathHistory[historyIndex + 1].pos;
                const d = p1.distanceTo(p2);
                
                if (distanceAccumulator + d >= targetDist) {
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

        // 7.5 Update Camera
        const idealCameraPos = this.head.position.clone().normalize().multiplyScalar(30);
        this.camera.position.lerp(idealCameraPos, 2.0 * dt);
        this.camera.lookAt(0, 0, 0);
        
        // Align up vector
        const snakeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.head.quaternion);
        this.camera.up.copy(snakeForward);

        // 8. Record Frame for Replay
        this.replaySystem.update(dt, () => ({
            head: this.head,
            camera: this.camera,
            food: this.food,
            bonusFoods: this.bonusFoods,
            segments: this.segments,
            score: this.score
        }));
    }

    getReplayJSON() {
        return this.replaySystem.getReplayJSON({
            earthRadius: this.EARTH_RADIUS,
            fps: this.RECORD_FPS,
            playerInfo: this.playerInfo,
            sounds: {
                eat: './snake_eat.mp3',
                die: './game_over.mp3'
            }
        });
    }

    gameOver() {
        this.isGameOver = true;
        this.lastDeathTime = Date.now();
        this.playSound('die');
        
        // Force record the death frame
        this.replaySystem.forceRecordFrame({
            head: this.head,
            camera: this.camera,
            food: this.food,
            bonusFoods: this.bonusFoods,
            segments: this.segments,
            score: this.score
        });

        document.getElementById('game-over').classList.remove('hidden');
        this.isPlaying = false;
    }
}
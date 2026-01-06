import * as THREE from 'three';
import { Game } from './game.js';

// Setup basic Three.js scene
const scene = new THREE.Scene();

// Camera setup
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
// Position camera for a nice orbital view
const cameraRig = new THREE.Group();
scene.add(cameraRig);
cameraRig.add(camera);
camera.position.z = 25;
camera.position.y = 10;
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Optimize for mobile
document.getElementById('game-container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(50, 50, 50);
scene.add(dirLight);

// Initialize Game
const game = new Game(scene, camera, renderer);

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function handleInput(x, y) {
    // Convert screen coords to Normalized Device Coordinates (-1 to +1)
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Raycast against the earth
    if (!game.earth) return;
    const intersects = raycaster.intersectObject(game.earth);

    if (intersects.length > 0) {
        // Pass the intersection point to the game logic
        game.setTarget(intersects[0].point);
        
        // Remove start message on first tap
        const msg = document.getElementById('start-message');
        if(msg) msg.style.display = 'none';
    }
}

// Event Listeners
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Touch events for mobile
window.addEventListener('touchstart', (e) => {
    if (game.isGameOver) {
        // Simple debounce for restart
        if (Date.now() - game.time > 1000) { // arbitrary reuse of logic, better to just use DOM click
            // Handled by click listener on game over modal
        }
    } else {
        const touch = e.touches[0];
        handleInput(touch.clientX, touch.clientY);
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    // Allow dragging to update direction continuously
    if(!game.isGameOver) {
        const touch = e.touches[0];
        handleInput(touch.clientX, touch.clientY);
    }
}, { passive: false });

// Mouse events for desktop testing
window.addEventListener('mousedown', (e) => {
    if(!game.isGameOver) handleInput(e.clientX, e.clientY);
});
window.addEventListener('mousemove', (e) => {
    if(e.buttons === 1 && !game.isGameOver) handleInput(e.clientX, e.clientY);
});

// Restart handler
document.getElementById('game-over').addEventListener('click', () => {
    if(game.isGameOver) {
        game.startGame();
    }
});

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const dt = Math.min(clock.getDelta(), 0.1); // Cap delta time
    
    // Update game logic (handles both playing and lobby/remote rendering)
    game.update(dt);

    if (game.isPlaying && !game.isGameOver) {
        // Camera Follow Logic
        const headPos = game.head.position;
        
        const idealCameraPos = headPos.clone().normalize().multiplyScalar(30);
        
        camera.position.lerp(idealCameraPos, 2.0 * dt);
        camera.lookAt(0, 0, 0); // Always look at core
        
        // Standard "Mario Galaxy" cam: Camera Up aligns with Head-to-Center vector (Gravity).
        camera.up.copy(headPos).normalize();
    } else {
        // Lobby Orbit
        const time = Date.now() * 0.0002;
        const radius = 35;
        const x = Math.sin(time) * radius;
        const y = Math.sin(time * 0.5) * 10;
        const z = Math.cos(time) * radius;
        
        const targetPos = new THREE.Vector3(x, y, z);
        camera.position.lerp(targetPos, 1.0 * dt);
        camera.lookAt(0, 0, 0);
    }
    
    renderer.render(scene, camera);
}

animate();
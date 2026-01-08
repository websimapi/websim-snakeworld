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
// Bright ambient light to ensure no part of the sphere is too dark
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); 
scene.add(ambientLight);

// Hemisphere light for natural, omnidirectional illumination
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemiLight);

// Camera-mounted light removed to prevent glare.
// Note: Camera is already added to the scene via cameraRig

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
        game.resetGame();
    }
});

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const dt = Math.min(clock.getDelta(), 0.1); // Cap delta time
    
    if (game.isPlaying) {
        game.update(dt);
        
        // Camera Follow Logic
        // Smoothly rotate the camera rig to keep the snake head roughly centered but maintain global orientation awareness
        // Actually, for a globe, it's often better to rotate the WORLD under the camera, or orbit the camera.
        // Let's implement a smooth orbit follow.
        
        const headPos = game.head.position;
        
        // We want the camera rig to rotate such that the head is "up" or visible.
        // Simple approach: look at earth center, position camera relative to head.
        
        const targetPos = headPos.clone().normalize().multiplyScalar(25); // Camera height
        // Add a bit of lag/smoothing
        cameraRig.position.lerp(new THREE.Vector3(0,0,0), 0.1); // Rig stays at center
        
        // Calculate rotation to align camera with head
        // We want the camera to be positioned "above" the head, slightly behind its movement direction?
        // For mobile "tap to direct", a static camera relative to the globe (rotating with the snake) might be dizzying.
        // Better: The Camera orbits the earth, tracking the head position.
        
        const idealCameraPos = headPos.clone().normalize().multiplyScalar(30);
        
        camera.position.lerp(idealCameraPos, 2.0 * dt);
        camera.lookAt(0, 0, 0); // Always look at core
        
        // Set Camera UP to align with the snake's forward direction
        // This ensures the snake always appears to move "up" the screen, preventing disorientation/flipping
        // and avoiding singularities at the poles
        if (game.head) {
            const snakeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(game.head.quaternion);
            camera.up.copy(snakeForward);
        }
    }
    
    renderer.render(scene, camera);
}

animate();
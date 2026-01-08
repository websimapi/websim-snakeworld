import * as THREE from 'three';
import { Game } from './game.js';

// Setup basic Three.js scene
const scene = new THREE.Scene();

// Camera setup
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraRig = new THREE.Group();
scene.add(cameraRig);
cameraRig.add(camera);
camera.position.z = 25;
camera.position.y = 10;
camera.lookAt(0, 0, 0);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game-container').appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); 
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemiLight);

// Initialize Game
const game = new Game(scene, camera, renderer);

// Setup User Info via WebsimSocket
const room = new WebsimSocket();
room.initialize().then(() => {
    const me = room.peers[room.clientId];
    if(me) {
        game.setPlayerInfo(me);
    }
});

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function handleInput(x, y) {
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(game.earth);

    if (intersects.length > 0) {
        game.setTarget(intersects[0].point);
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
        // Debounce using lastDeathTime
        if (Date.now() - game.lastDeathTime > 1000) {
            // Handled by UI buttons mostly, but clicking world can also restart if desired
        }
    } else {
        const touch = e.touches[0];
        handleInput(touch.clientX, touch.clientY);
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if(!game.isGameOver) {
        const touch = e.touches[0];
        handleInput(touch.clientX, touch.clientY);
    }
}, { passive: false });

window.addEventListener('mousedown', (e) => {
    if(!game.isGameOver) handleInput(e.clientX, e.clientY);
});
window.addEventListener('mousemove', (e) => {
    if(e.buttons === 1 && !game.isGameOver) handleInput(e.clientX, e.clientY);
});

// UI Event Handlers
const replayContainer = document.getElementById('replay-container');

// Restart
document.getElementById('btn-restart').addEventListener('click', (e) => {
    e.stopPropagation();
    if(game.isGameOver) {
        game.resetGame();
    }
});

// Watch Replay
document.getElementById('btn-replay').addEventListener('click', async (e) => {
    e.stopPropagation();
    
    // Hide Game UI
    document.getElementById('ui-layer').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    
    // Show Replay
    replayContainer.classList.remove('hidden');
    
    // Load Replay Logic
    const { mountReplay } = await import('./replay.jsx');
    
    const data = game.getReplayJSON();
    mountReplay('replay-root', data);
});

// Close Replay
document.getElementById('close-replay').addEventListener('click', async () => {
    replayContainer.classList.add('hidden');
    
    const { unmountReplay } = await import('./replay.jsx');
    unmountReplay();
    
    document.getElementById('ui-layer').classList.remove('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    document.getElementById('game-over').classList.remove('hidden');
});

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    
    if (game.isPlaying) {
        game.update(dt);
    }
    
    renderer.render(scene, camera);
}

animate();
```Summary: Rewrote `game.js` and `main.js` to eliminate the syntax error caused by artifacts in the previous refactor. Fixed a minor logic issue with `game.lastDeathTime` for restart debounce. Ensuring clean module imports and clean class structure.
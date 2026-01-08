/**
 * Handles recording game state and generating Replay JSON data.
 */
export class ReplaySystem {
    constructor(fps) {
        this.fps = fps;
        this.frames = [];
        this.frameEvents = []; // Events for the *current* frame being built
        this.accumulator = 0;
    }

    reset() {
        this.frames = [];
        this.frameEvents = [];
        this.accumulator = 0;
    }

    logEvent(eventName) {
        this.frameEvents.push(eventName);
    }

    /**
     * Updates recording timer and records frame if needed.
     * @param {number} dt - Delta time
     * @param {Function} stateFn - Function returning the current game state object
     */
    update(dt, stateFn) {
        this.accumulator += dt;
        if (this.accumulator >= 1 / this.fps) {
            this.recordFrame(stateFn());
            this.accumulator = 0;
        }
    }

    recordFrame(state) {
        // state expects:
        // { head, camera, food, bonusFoods, segments, score }
        // where head, camera are Three.js objects, bonusFoods/segments are arrays of meshes
        
        const frame = {
            head: {
                pos: state.head.position.toArray(),
                quat: state.head.quaternion.toArray()
            },
            camera: {
                pos: state.camera.position.toArray(),
                quat: state.camera.quaternion.toArray(),
                up: state.camera.up.toArray()
            },
            food: state.food.position.toArray(),
            bonusFoods: state.bonusFoods.map(b => b.position.toArray()),
            segments: state.segments.map(seg => ({
                pos: seg.position.toArray(),
                quat: seg.quaternion.toArray(),
                color: seg.material.color.getHex()
            })),
            score: state.score,
            events: [...this.frameEvents]
        };
        this.frames.push(frame);
        this.frameEvents = []; // Reset events for next frame
    }

    /**
     * Returns the full JSON object required by replay.jsx
     */
    getReplayJSON(config) {
        // Clone the frames to avoid mutating the original recording
        const frames = [...this.frames];
        
        // Add padding frames at the end to show the aftermath
        if (frames.length > 0) {
            const lastFrame = frames[frames.length - 1];
            // Create a static frame copy with no events
            const paddingFrame = {
                ...lastFrame,
                events: []
            };
            
            const paddingFramesCount = 5 * this.fps; // 5 seconds padding
            for (let i = 0; i < paddingFramesCount; i++) {
                frames.push(paddingFrame);
            }
        }

        return {
            frames: frames,
            config: config
        };
    }

    /**
     * Explicitly record a frame immediately (e.g. for Game Over)
     */
    forceRecordFrame(state) {
        this.recordFrame(state);
    }
}
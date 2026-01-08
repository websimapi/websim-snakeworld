/**
 * Handles Audio Context, loading, and playing sounds.
 */
export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
    }

    async load(name, url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.sounds[name] = audioBuffer;
        } catch (e) {
            console.error('Error loading sound:', name, e);
        }
    }

    play(name) {
        if (this.sounds[name] && this.ctx.state === 'running') {
            const source = this.ctx.createBufferSource();
            source.buffer = this.sounds[name];
            source.connect(this.ctx.destination);
            source.start(0);
            return true;
        }
        return false;
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    getState() {
        return this.ctx.state;
    }
}
import * as THREE from 'three';

export class RemoteSnake {
    constructor(scene, id, hue) {
        this.scene = scene;
        this.id = id;
        this.hue = hue !== undefined ? hue : Math.random();
        
        this.segments = [];
        this.pathHistory = [];
        this.SEGMENT_DISTANCE = 0.8;
        
        // Head
        const headGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
        const headMat = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color().setHSL(this.hue, 1.0, 0.5),
            emissive: new THREE.Color().setHSL(this.hue, 1.0, 0.2)
        });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.scene.add(this.head);
        
        this.targetSegments = 5;
    }
    
    update(presence, dt) {
        // Sync Head
        if (presence.x !== undefined) {
            const targetPos = new THREE.Vector3(presence.x, presence.y, presence.z);
            const targetQuat = new THREE.Quaternion(presence.qx, presence.qy, presence.qz, presence.qw);
            
            // Smooth lerp for network jitter
            this.head.position.lerp(targetPos, 15 * dt); 
            this.head.quaternion.slerp(targetQuat, 15 * dt);
        }
        
        this.targetSegments = presence.segments || 5;
        
        // Adjust segment count
        while(this.segments.length < this.targetSegments) {
            this.addSegment();
        }
        while(this.segments.length > this.targetSegments) {
            const seg = this.segments.pop();
            this.scene.remove(seg);
        }
        
        // History & Trail
        // We record the history of the interpolated head to make the body follow smooth
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
        
        // Update Segments
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
    }
    
    addSegment() {
        const segGeo = new THREE.BoxGeometry(0.6, 0.3, 0.6);
        const color = new THREE.Color().setHSL(this.hue, 1.0, 0.5 - ((this.segments.length * 0.02) % 0.5));
        const segMat = new THREE.MeshStandardMaterial({ color: color });
        const segment = new THREE.Mesh(segGeo, segMat);
        
        // Initialize at head
        segment.position.copy(this.head.position);
        
        this.scene.add(segment);
        this.segments.push(segment);
    }
    
    dispose() {
        this.scene.remove(this.head);
        this.segments.forEach(s => this.scene.remove(s));
    }
}
import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@websim/remotion/player";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Audio, Sequence } from "remotion";
import * as THREE from "three";
const ReplayScene = ({ data }) => {
  const frameIndex = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const containerRef = useRef(null);
  const audioCues = useMemo(() => {
    const cues = [];
    if (!data || !data.frames) return cues;
    data.frames.forEach((frame, idx) => {
      if (frame.events && frame.events.length > 0) {
        frame.events.forEach((soundName, i) => {
          const url = data.config.sounds && data.config.sounds[soundName];
          if (url) {
            cues.push({
              id: `sfx-${idx}-${i}-${soundName}`,
              frame: idx,
              src: url
            });
          }
        });
      }
    });
    return cues;
  }, [data]);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const objectsRef = useRef({
    earth: null,
    head: null,
    food: null,
    segments: [],
    cameraRig: null
  });
  useEffect(() => {
    if (!data || !data.frames || data.frames.length === 0) return;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1e3);
    cameraRef.current = camera;
    const cameraRig = new THREE.Group();
    scene.add(cameraRig);
    cameraRig.add(camera);
    camera.position.z = 25;
    camera.position.y = 10;
    camera.lookAt(0, 0, 0);
    objectsRef.current.cameraRig = cameraRig;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0, 1);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    const ambientLight = new THREE.AmbientLight(16777215, 0.5);
    scene.add(ambientLight);
    const hemiLight = new THREE.HemisphereLight(16777215, 4473924, 1);
    scene.add(hemiLight);
    const r = data.config.earthRadius;
    const earthGeo = new THREE.SphereGeometry(r, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      color: 8965375,
      emissive: 8772,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.7,
      roughness: 0.9,
      side: THREE.DoubleSide
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);
    objectsRef.current.earth = earth;
    const atmGeo = new THREE.SphereGeometry(r * 1.03, 64, 64);
    const atmMat = new THREE.MeshBasicMaterial({
      color: 4491519,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));
    const headGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
    const headMat = new THREE.MeshStandardMaterial({ color: 65280, emissive: 17408 });
    const head = new THREE.Mesh(headGeo, headMat);
    scene.add(head);
    objectsRef.current.head = head;
    const foodGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const foodMat = new THREE.MeshStandardMaterial({ color: 16755200, emissive: 16711680, emissiveIntensity: 0.5 });
    const food = new THREE.Mesh(foodGeo, foodMat);
    scene.add(food);
    objectsRef.current.food = food;
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        containerRef.current.innerHTML = "";
      }
    };
  }, [width, height, data]);
  useLayoutEffect(() => {
    if (!sceneRef.current || !data.frames) return;
    const safeIndex = Math.min(Math.floor(frameIndex), data.frames.length - 1);
    if (safeIndex < 0) return;
    const frameData = data.frames[safeIndex];
    const objs = objectsRef.current;
    objs.head.position.fromArray(frameData.head.pos);
    objs.head.quaternion.fromArray(frameData.head.quat);
    objs.food.position.fromArray(frameData.food);
    while (objs.segments.length < frameData.segments.length) {
      const segGeo = new THREE.BoxGeometry(0.6, 0.3, 0.6);
      const colorHex = frameData.segments[objs.segments.length].color;
      const segMat = new THREE.MeshStandardMaterial({ color: colorHex });
      const segment = new THREE.Mesh(segGeo, segMat);
      sceneRef.current.add(segment);
      objs.segments.push(segment);
    }
    while (objs.segments.length > frameData.segments.length) {
      const segment = objs.segments.pop();
      sceneRef.current.remove(segment);
      if (segment.geometry) segment.geometry.dispose();
      if (segment.material) segment.material.dispose();
    }
    frameData.segments.forEach((segData, i) => {
      if (objs.segments[i]) {
        objs.segments[i].position.fromArray(segData.pos);
        objs.segments[i].quaternion.fromArray(segData.quat);
        if (segData.color !== void 0) {
          objs.segments[i].material.color.setHex(segData.color);
        }
      }
    });
    if (frameData.camera) {
      cameraRef.current.position.fromArray(frameData.camera.pos);
      cameraRef.current.quaternion.fromArray(frameData.camera.quat);
      cameraRef.current.up.fromArray(frameData.camera.up);
    } else {
      const headPos = objs.head.position.clone();
      const idealCameraPos = headPos.clone().normalize().multiplyScalar(30);
      const cam = cameraRef.current;
      cam.position.lerp(idealCameraPos, 0.1);
      cam.lookAt(0, 0, 0);
      const snakeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(objs.head.quaternion);
      cam.up.copy(snakeForward);
    }
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, [frameIndex, data]);
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { children: [
    /* @__PURE__ */ jsxDEV("div", { ref: containerRef, style: { width: "100%", height: "100%" } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 202,
      columnNumber: 13
    }),
    audioCues.map((cue) => /* @__PURE__ */ jsxDEV(Sequence, { from: cue.frame, children: /* @__PURE__ */ jsxDEV(Audio, { src: cue.src }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 205,
      columnNumber: 21
    }) }, cue.id, false, {
      fileName: "<stdin>",
      lineNumber: 204,
      columnNumber: 17
    }))
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 201,
    columnNumber: 9
  });
};
let replayRoot = null;
const mountReplay = (containerId, replayData) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (replayRoot) {
    replayRoot.unmount();
  }
  replayRoot = createRoot(container);
  const duration = replayData.frames.length;
  const fps = replayData.config.fps || 30;
  replayRoot.render(
    /* @__PURE__ */ jsxDEV("div", { style: { width: "100%", height: "100%", background: "#000" }, children: /* @__PURE__ */ jsxDEV(
      Player,
      {
        component: ReplayScene,
        inputProps: { data: replayData },
        durationInFrames: duration,
        fps,
        compositionWidth: window.innerWidth,
        compositionHeight: window.innerHeight,
        style: { width: "100%", height: "100%" },
        controls: true,
        loop: true,
        autoPlay: true
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 232,
        columnNumber: 13
      }
    ) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 231,
      columnNumber: 9
    })
  );
};
const unmountReplay = () => {
  if (replayRoot) {
    replayRoot.unmount();
    replayRoot = null;
  }
};
export {
  mountReplay,
  unmountReplay
};

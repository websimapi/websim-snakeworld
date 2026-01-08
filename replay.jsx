import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
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
              src: url,
              name: soundName
            });
          }
        });
      }
    });
    return cues;
  }, [data]);
  const activeCues = audioCues.filter((cue) => {
    const duration = cue.name === "die" ? 150 : 30;
    return frameIndex >= cue.frame && frameIndex < cue.frame + duration;
  });
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const objectsRef = useRef({
    earth: null,
    head: null,
    food: null,
    bonusFoods: [],
    // Array of meshes
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0, 1);
    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }
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
    const foodGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const foodMat = new THREE.MeshStandardMaterial({ color: 16755200, emissive: 16711680, emissiveIntensity: 0.5 });
    const food = new THREE.Mesh(foodGeo, foodMat);
    scene.add(food);
    objectsRef.current = {
      earth,
      head,
      food,
      bonusFoods: [],
      segments: [],
      cameraRig
    };
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      sceneRef.current = null;
    };
  }, [width, height, data]);
  useLayoutEffect(() => {
    if (!sceneRef.current || !rendererRef.current || !data.frames) return;
    const safeIndex = Math.min(Math.floor(frameIndex), data.frames.length - 1);
    if (safeIndex < 0) return;
    const frameData = data.frames[safeIndex];
    const objs = objectsRef.current;
    if (!objs.head || !objs.food) return;
    objs.head.position.fromArray(frameData.head.pos);
    objs.head.quaternion.fromArray(frameData.head.quat);
    objs.food.position.fromArray(frameData.food);
    const bonusData = frameData.bonusFoods || [];
    while (objs.bonusFoods.length < bonusData.length) {
      const bGeo = new THREE.SphereGeometry(0.25, 8, 8);
      const bMat = new THREE.MeshStandardMaterial({
        color: 16776960,
        emissive: 16755200,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(bGeo, bMat);
      sceneRef.current.add(mesh);
      objs.bonusFoods.push(mesh);
    }
    while (objs.bonusFoods.length > bonusData.length) {
      const mesh = objs.bonusFoods.pop();
      if (mesh) {
        sceneRef.current.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      }
    }
    bonusData.forEach((pos, i) => {
      if (objs.bonusFoods[i]) {
        objs.bonusFoods[i].position.fromArray(pos);
      }
    });
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
      if (segment && sceneRef.current) {
        sceneRef.current.remove(segment);
        if (segment.geometry) segment.geometry.dispose();
        if (segment.material) segment.material.dispose();
      }
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
    if (frameData.camera && cameraRef.current) {
      cameraRef.current.position.fromArray(frameData.camera.pos);
      cameraRef.current.quaternion.fromArray(frameData.camera.quat);
      cameraRef.current.up.fromArray(frameData.camera.up);
    } else if (cameraRef.current) {
      const headPos = objs.head.position.clone();
      const idealCameraPos = headPos.clone().normalize().multiplyScalar(30);
      const cam = cameraRef.current;
      cam.position.lerp(idealCameraPos, 0.1);
      cam.lookAt(0, 0, 0);
      const snakeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(objs.head.quaternion);
      cam.up.copy(snakeForward);
    }
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, [frameIndex, data]);
  const currentFrameData = data.frames[Math.min(Math.floor(frameIndex), data.frames.length - 1)] || {};
  const score = currentFrameData.score || 0;
  const playerInfo = data.config.playerInfo || { username: "Player", avatarUrl: "https://via.placeholder.com/64" };
  if (!data) return null;
  return /* @__PURE__ */ jsxDEV(AbsoluteFill, { children: [
    /* @__PURE__ */ jsxDEV("div", { ref: containerRef, style: { width: "100%", height: "100%" } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 272,
      columnNumber: 13
    }),
    /* @__PURE__ */ jsxDEV("div", { style: {
      position: "absolute",
      top: "20px",
      left: "20px",
      display: "flex",
      alignItems: "flex-start",
      gap: "15px",
      pointerEvents: "none",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    }, children: [
      /* @__PURE__ */ jsxDEV("div", { style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "5px"
      }, children: [
        /* @__PURE__ */ jsxDEV(
          "img",
          {
            src: playerInfo.avatarUrl || "https://via.placeholder.com/64",
            style: {
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              border: "3px solid white",
              backgroundColor: "#333",
              objectFit: "cover",
              boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
            }
          },
          void 0,
          false,
          {
            fileName: "<stdin>",
            lineNumber: 291,
            columnNumber: 21
          }
        ),
        /* @__PURE__ */ jsxDEV("div", { style: {
          color: "white",
          fontSize: "14px",
          fontWeight: "600",
          textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
          background: "rgba(0,0,0,0.5)",
          padding: "2px 6px",
          borderRadius: "4px",
          maxWidth: "100px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }, children: playerInfo.username }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 303,
          columnNumber: 21
        })
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 285,
        columnNumber: 17
      }),
      /* @__PURE__ */ jsxDEV("div", { style: {
        fontSize: "48px",
        color: "white",
        fontWeight: "bold",
        textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
        alignSelf: "flex-start",
        marginTop: "10px"
      }, children: score }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 319,
        columnNumber: 17
      })
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 275,
      columnNumber: 13
    }),
    activeCues.map((cue) => {
      const duration = cue.name === "die" ? 150 : 30;
      return /* @__PURE__ */ jsxDEV(Sequence, { from: cue.frame, durationInFrames: duration, children: /* @__PURE__ */ jsxDEV(Audio, { src: cue.src }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 335,
        columnNumber: 25
      }) }, cue.id, false, {
        fileName: "<stdin>",
        lineNumber: 334,
        columnNumber: 21
      });
    })
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 271,
    columnNumber: 9
  });
};
let replayRoot = null;
let playerRef = null;
let currentDuration = 0;
const mountReplay = (containerId, replayData) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (replayRoot) {
    replayRoot.unmount();
  }
  replayRoot = createRoot(container);
  const duration = replayData.frames.length;
  currentDuration = duration;
  const fps = replayData.config.fps || 30;
  playerRef = { current: null };
  replayRoot.render(
    /* @__PURE__ */ jsxDEV("div", { style: { width: "100%", height: "100%", background: "#000" }, children: /* @__PURE__ */ jsxDEV(
      Player,
      {
        ref: playerRef,
        component: ReplayScene,
        inputProps: { data: replayData },
        durationInFrames: duration,
        fps,
        compositionWidth: window.innerWidth,
        compositionHeight: window.innerHeight,
        style: { width: "100%", height: "100%" },
        controls: true,
        loop: true,
        autoPlay: true,
        numberOfSharedAudioTags: 20
      },
      void 0,
      false,
      {
        fileName: "<stdin>",
        lineNumber: 369,
        columnNumber: 13
      }
    ) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 368,
      columnNumber: 9
    })
  );
};
const unmountReplay = () => {
  if (replayRoot) {
    replayRoot.unmount();
    replayRoot = null;
    playerRef = null;
  }
};
const downloadRecording = async () => {
  if (!playerRef || !playerRef.current) {
    throw new Error("Player not initialized");
  }
  const canvas = document.querySelector("#replay-root canvas");
  if (!canvas) {
    throw new Error("Canvas not found");
  }
  playerRef.current.pause();
  playerRef.current.seekTo(0);
  await new Promise((r) => setTimeout(r, 500));
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported("video/webm; codecs=vp9") ? "video/webm; codecs=vp9" : "video/webm"
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const recordingPromise = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snake-replay-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    };
  });
  recorder.start();
  playerRef.current.play();
  const pollInterval = setInterval(() => {
    if (!playerRef.current) {
      clearInterval(pollInterval);
      recorder.stop();
      return;
    }
    const frame = playerRef.current.getCurrentFrame();
    if (frame >= currentDuration - 1) {
      clearInterval(pollInterval);
      recorder.stop();
      playerRef.current.pause();
    }
  }, 100);
  return recordingPromise;
};
export {
  ReplayScene,
  downloadRecording,
  mountReplay,
  unmountReplay
};

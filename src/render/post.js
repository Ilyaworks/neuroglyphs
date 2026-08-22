import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FisheyeShader, ChromaShader } from "./shaders.js";

export function buildComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const halfWidth = Math.max(1, Math.floor(window.innerWidth / 2));
  const halfHeight = Math.max(1, Math.floor(window.innerHeight / 2));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(halfWidth, halfHeight), 0.45, 0.4, 0.8);
  composer.addPass(bloomPass);
  const fisheyePass = new ShaderPass(FisheyeShader);
  const chromaPass = new ShaderPass(ChromaShader);
  composer.addPass(fisheyePass);
  composer.addPass(chromaPass);

  function resize(width, height) {
    composer.setSize(width, height);
    bloomPass.resolution.set(
      Math.max(1, Math.floor(width / 2)),
      Math.max(1, Math.floor(height / 2)),
    );
  }

  function dispose() {
    composer.dispose();
    bloomPass.dispose();
  }

  return {
    composer,
    setBloom(strength, radius, threshold) {
      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;
    },
    setFisheye(v) {
      fisheyePass.uniforms.strength.value = v;
    },
    setChroma(v) {
      chromaPass.uniforms.amount.value = v;
    },
    resize,
    dispose,
  };
}

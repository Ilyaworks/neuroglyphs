// Эталон для tools/post-check.mjs: минимальная, но правильная связка постобработки.
// Гейт обязан быть зелёным на этом файле и красным на сломанном.
//
// Здесь важен один приём: uniform-ы прохода — это КОПИЯ шаблона из shaders.js.
// ShaderPass клонирует их сам, поэтому setFisheye обязан писать в pass.uniforms,
// а не в FisheyeShader.uniforms — иначе правка уходит в общий шаблон, эффекта нет,
// а синтаксис безупречен.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FisheyeShader, ChromaShader } from "../src/render/shaders.js";

export function buildComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const size = new THREE.Vector2();
  renderer.getSize(size);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, size.x), Math.max(1, size.y)), 0.9, 0.5, 0.15);
  composer.addPass(bloomPass);

  const fisheyePass = new ShaderPass(FisheyeShader);
  composer.addPass(fisheyePass);

  const chromaPass = new ShaderPass(ChromaShader);
  composer.addPass(chromaPass);

  // Оба выключены по умолчанию: ноль в этих шейдерах — тождественность.
  fisheyePass.uniforms.strength.value = 0;
  chromaPass.uniforms.amount.value = 0;

  return {
    composer,
    setBloom(strength, radius, threshold) {
      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;
    },
    setFisheye(v) {
      if (Number.isFinite(v)) fisheyePass.uniforms.strength.value = v;
    },
    setChroma(v) {
      if (Number.isFinite(v)) chromaPass.uniforms.amount.value = v;
    },
    resize(width, height) {
      composer.setSize(width, height);
    },
    dispose() {
      composer.dispose();
      bloomPass.dispose();
      fisheyePass.dispose();
      chromaPass.dispose();
    },
  };
}

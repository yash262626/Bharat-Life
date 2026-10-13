// Renderer + post-processing chain: scene -> GTAO (ambient occlusion) -> bloom -> filmic tone map
// -> colour grade -> SMAA. Quality presets scale shadows, AO, bloom and resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  pixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  shadowExtent: number;
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
  drawDistance: number;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: { pixelRatio: 0.75, shadows: false, shadowMap: 1024, shadowExtent: 40, ao: false, bloom: false, smaa: false, drawDistance: 900 },
  medium: { pixelRatio: 1, shadows: true, shadowMap: 2048, shadowExtent: 55, ao: false, bloom: true, smaa: true, drawDistance: 2500 },
  high: { pixelRatio: 1, shadows: true, shadowMap: 2048, shadowExtent: 70, ao: true, bloom: true, smaa: true, drawDistance: 6000 },
  ultra: { pixelRatio: 1.5, shadows: true, shadowMap: 4096, shadowExtent: 80, ao: true, bloom: true, smaa: true, drawDistance: 9000 },
};

/** Display-space colour grade: restrained saturation, gentle S-curve, warm highlights / cool shadows, vignette. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    saturation: { value: 0.9 },
    contrast: { value: 1.06 },
    warmth: { value: 0.03 },
    vignette: { value: 0.28 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float saturation; uniform float contrast; uniform float warmth; uniform float vignette;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      // S-curve around mid grey
      c = clamp((c - 0.5) * contrast + 0.5, 0.0, 1.0);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);
      // split toning: cool shadows, warm highlights
      c += vec3(warmth, warmth * 0.35, -warmth) * smoothstep(0.35, 1.0, l);
      c += vec3(-0.012, 0.0, 0.018) * (1.0 - smoothstep(0.0, 0.35, l));
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * dot(d, d) * 1.6;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  quality: Quality;
  settings: QualitySettings;
  private renderPass: RenderPass;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private output: OutputPass;
  private smaa: SMAAPass | null = null;

  constructor(container: HTMLElement, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, quality: Quality = 'high') {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.quality = quality;
    this.settings = QUALITY[quality];

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.08, 0.5, 1.4);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.rebuild();
    addEventListener('resize', () => this.resize());
  }

  private rebuild() {
    const s = this.settings;
    // remove all passes except render pass, then re-add per settings
    for (const p of [...this.composer.passes]) if (p !== this.renderPass) this.composer.removePass(p);
    const size = new THREE.Vector2(innerWidth * s.pixelRatio, innerHeight * s.pixelRatio);
    if (s.ao) {
      if (!this.gtao) {
        this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
        this.gtao.blendIntensity = 0.85;
        this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
        this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      }
      this.composer.addPass(this.gtao);
    }
    if (s.bloom) this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    if (s.smaa) {
      if (!this.smaa) this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
    this.renderer.shadowMap.enabled = s.shadows;
    this.resize();
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.settings = QUALITY[q];
    this.rebuild();
  }

  resize() {
    const s = this.settings;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * s.pixelRatio;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /** Night: stronger bloom on lights. Rain: lower contrast. */
  setMood(night: number, rain: number) {
    this.bloom.strength = 0.05 + night * 0.5;
    this.bloom.threshold = 1.4 - night * 0.6;
    this.renderer.toneMappingExposure = 0.92 + night * 0.25;
    const u = this.grade.uniforms;
    u.saturation.value = 0.9 - rain * 0.12;
    u.contrast.value = 1.06 - rain * 0.05;
    u.warmth.value = 0.03 * (1 - rain);
  }

  render() {
    this.composer.render();
  }

  /** GPU description for the settings menu / hardware notes. */
  gpuInfo(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  }
}

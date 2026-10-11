import * as THREE from 'three'
import { getPattern } from '../../utils/textures'
import { buildHorizon } from '../models/PropModels'
import { RNG } from '../../utils/math'
import type { MapDef } from '../../data/maps'

const SKY_VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; gl_Position.z = gl_Position.w; }`
const SKY_FRAG = `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vW;
void main(){ vec3 d = normalize(vW - cameraPosition); float h = d.y;
 vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0,h*1.6), 0.8)) : mix(horizon, bottom, min(1.0,-h*4.0));
 float s = max(0.0, dot(d, normalize(sunDir)));
 c += sunColor * (pow(s, 600.0)*3.0 + pow(s, 12.0)*0.25);
 // pixelated sun disc (minecraft square sun)
 gl_FragColor = vec4(c,1.0); }`

export interface Theme {
  top: string
  horizon: string
  bottom: string
  sun: string
  fog: string
  hemiSky: string
  hemiGround: string
  sunIntensity: number
}

export const THEMES: Record<string, Theme> = {
  dusk: { top: '#4a6fa8', horizon: '#f0b27a', bottom: '#6a5a4a', sun: '#ffd7a0', fog: '#d9b08a', hemiSky: '#c8d8f0', hemiGround: '#6a5a40', sunIntensity: 2.3 },
  day: { top: '#3f78c8', horizon: '#bcd6ea', bottom: '#6a7a5a', sun: '#fff2d8', fog: '#bccfdc', hemiSky: '#cfe2ff', hemiGround: '#5a6a3a', sunIntensity: 2.6 },
  overcast: { top: '#7a8794', horizon: '#c3c0b8', bottom: '#5a5a50', sun: '#f0e6d8', fog: '#b8b4aa', hemiSky: '#d0d0d0', hemiGround: '#5a5a4a', sunIntensity: 1.6 },
  forest: { top: '#5a86b8', horizon: '#cfe0c8', bottom: '#3a4a2a', sun: '#fff0c8', fog: '#a9c0a0', hemiSky: '#d8e8d0', hemiGround: '#3a4a2a', sunIntensity: 2.2 },
}

export class Environment {
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  sky: THREE.Mesh
  clouds: THREE.InstancedMesh
  fog: THREE.Fog
  baseFogNear: number
  baseFogFar: number
  theme: Theme
  sunOffset = new THREE.Vector3(-130, 210, -170)
  private cloudOffset = 0
  ground: THREE.Mesh
  extraFog = 0

  constructor(private scene: THREE.Scene, map: MapDef, quality: 'low' | 'medium' | 'high', shadows: boolean) {
    this.theme = THEMES[map.id === 'shiganshina' ? 'dusk' : map.id === 'trost' ? 'overcast' : map.id === 'forest' ? 'forest' : 'day']
    const th = this.theme
    this.baseFogNear = quality === 'low' ? 120 : 180
    this.baseFogFar = quality === 'low' ? 650 : quality === 'medium' ? 950 : 1300
    this.fog = new THREE.Fog(th.fog, this.baseFogNear, this.baseFogFar)
    scene.fog = this.fog
    scene.background = new THREE.Color(th.fog)

    this.hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 1.6)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(th.sun, th.sunIntensity)
    this.sun.position.copy(this.sunOffset)
    if (shadows && quality !== 'low') {
      this.sun.castShadow = true
      const s = quality === 'high' ? 2048 : 1024
      this.sun.shadow.mapSize.set(s, s)
      const ext = quality === 'high' ? 110 : 80
      const cam = this.sun.shadow.camera
      cam.left = -ext
      cam.right = ext
      cam.top = ext
      cam.bottom = -ext
      cam.near = 10
      cam.far = 600
      this.sun.shadow.bias = -0.0008
      this.sun.shadow.normalBias = 0.6
    }
    scene.add(this.sun, this.sun.target)

    // sky dome
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(2500, 24, 12),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(th.top) },
          horizon: { value: new THREE.Color(th.horizon) },
          bottom: { value: new THREE.Color(th.bottom) },
          sunDir: { value: this.sunOffset.clone().normalize() },
          sunColor: { value: new THREE.Color(th.sun) },
        },
      }),
    )
    this.sky.renderOrder = -10
    this.sky.frustumCulled = false
    scene.add(this.sky)

    // minecraft-like flat block clouds
    const rng = new RNG(map.seed + 5)
    const n = quality === 'low' ? 40 : 90
    this.clouds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, fog: false }),
      n,
    )
    const m = new THREE.Matrix4()
    for (let i = 0; i < n; i++) {
      m.makeScale(rng.range(40, 140), 10, rng.range(30, 110))
      m.setPosition(rng.range(-1600, 1600), rng.range(230, 290), rng.range(-1600, 1600))
      this.clouds.setMatrixAt(i, m)
    }
    this.clouds.frustumCulled = false
    scene.add(this.clouds)

    // ground: huge grass plane
    const gTex = getPattern('grass').clone()
    gTex.repeat.set(1500, 1500)
    gTex.needsUpdate = true
    const groundCol = new THREE.Color(map.preview.ground)
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: groundCol, map: gTex }))
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    scene.add(this.ground)

    // horizon mountains
    const hz = buildHorizon(1500, map.seed)
    scene.add(hz)
  }

  /** keep shadow camera centred on the player (dynamic shadows only near the player) */
  follow(target: THREE.Vector3, dt: number) {
    this.sun.position.copy(target).add(this.sunOffset)
    this.sun.target.position.copy(target)
    this.sky.position.copy(target)
    this.cloudOffset += dt * 3
    this.clouds.position.set(this.cloudOffset % 400, 0, 0)
    this.fog.near = Math.max(15, this.baseFogNear * (1 - this.extraFog * 0.92))
    this.fog.far = Math.max(90, this.baseFogFar * (1 - this.extraFog * 0.85))
  }

  dispose() {
    this.scene.remove(this.sky, this.clouds, this.ground, this.sun, this.hemi)
  }
}

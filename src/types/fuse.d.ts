declare module '@opengolfsim/fuse' {
  import type { Camera, ColorRepresentation, Fog, Group, Mesh, Object3D, Scene, Vector3, WebGLRenderer } from 'three'

  export class FuseRenderer {
    renderer: WebGLRenderer
    constructor(options: {
      canvas: HTMLElement | null
      container?: HTMLElement
      adaptive?: boolean
      antialias?: boolean
      renderMode?: 'webgl' | 'webgpu'
      qualityLevel?: number
    })
    render(scene: Scene, camera: Camera, fog?: Fog): void
    _handleResize(): void
    getMaxAnisotropy(): number
    getMaxTextureSize(): number
  }

  export class CourseLight extends Group {
    constructor(options?: {
      color?: ColorRepresentation
      ambient?: { enabled?: boolean; intensity?: number }
      directional?: { enabled?: boolean; intensity?: number }
    })
  }

  export class MeshLoader {
    constructor(renderer: FuseRenderer)
    load(meshUri: string, firstMeshOnly: true): Promise<Mesh | undefined>
    load(meshUri: string, firstMeshOnly?: false): Promise<Group | undefined>
  }

  export class YardageLinesMaterial {
    constructor(object: Object3D, ballPos: Vector3, aimPoint: Vector3, distances: number[], options?: {
      lineWidth?: number
      lineLength?: number
      lineColor?: [number, number, number, number]
      feather?: number
      labels?: (string | number)[]
      labelSize?: [number, number]
      labelGap?: number
      maxTextureSize?: number
      texelsPerMeter?: number
    })
    dispose(): void
  }
}

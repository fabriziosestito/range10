declare module '@opengolfsim/fuse' {
  import type { Camera, Fog, Scene, WebGLRenderer } from 'three'

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
  }
}

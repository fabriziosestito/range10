import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserver)
}

vi.mock('@opengolfsim/fuse', () => ({
  FuseRenderer: class {
    renderer = { setClearColor() {}, dispose() {}, getMaxAnisotropy() { return 1 }, setPixelRatio() {}, setSize() {}, setNodesHandler() {}, shadowMap: { enabled: false, type: 0 }, toneMapping: 0, toneMappingExposure: 1, capabilities: { getMaxAnisotropy() { return 1 } } }
    render() {}
    _handleResize() {}
    getMaxAnisotropy() { return 1 }
    getMaxTextureSize() { return 4096 }
  },
  CourseLight: class { add() {} },
  MeshLoader: class { load() { return Promise.resolve(undefined) } },
  YardageLinesMaterial: class { dispose() {} },
}))

afterEach(() => {
  cleanup()
})
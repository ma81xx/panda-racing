import * as THREE from 'three';

function extensionState(gl, name) {
  return gl.getExtension(name) ? 'sì' : 'no';
}

export function createDebugRenderer(scene, world, gui, renderer) {
  const material = new THREE.LineBasicMaterial({ color: 0x00ff88, vertexColors: true });
  const geometry = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  scene.add(lines);

  const settings = { showPhysicsDebug: false };
  gui.add(settings, 'showPhysicsDebug').name('Physics wireframe');

  const gl = renderer.getContext();
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const highpFormat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const info = {
    fps: 0,
    webgl: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1',
    gpu: String(debugExt ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    vendor: String(debugExt ? gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    glVersion: String(gl.getParameter(gl.VERSION)),
    glsl: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
    precision: renderer.capabilities.precision,
    fragmentHighp: highpFormat && highpFormat.precision > 0 ? `sì (${highpFormat.precision})` : 'no',
    userAgent: navigator.userAgent,
    environment: '...',
    pixelRatio: renderer.getPixelRatio().toFixed(2),
    drawingBuffer: '',
    maxTextureSize: renderer.capabilities.maxTextureSize,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    shaderErrors: 0,
    shaderLog: '',
    colorBufferHalfFloat: extensionState(gl, 'EXT_color_buffer_half_float'),
    colorBufferFloat: extensionState(gl, 'EXT_color_buffer_float'),
    halfFloatLinear: extensionState(gl, 'OES_texture_half_float_linear'),
    floatLinear: extensionState(gl, 'OES_texture_float_linear'),
    anisotropic: extensionState(gl, 'EXT_texture_filter_anisotropic')
  };

  const folder = gui.addFolder('Info debug');
  const controllers = [];
  const add = (key, label) => controllers.push(folder.add(info, key).name(label).disable());
  add('fps', 'FPS');
  add('webgl', 'WebGL');
  add('gpu', 'GPU');
  add('vendor', 'Vendor');
  add('glVersion', 'GL version');
  add('glsl', 'GLSL');
  add('precision', 'Precision default');
  add('fragmentHighp', 'Fragment highp');
  add('pixelRatio', 'Pixel ratio');
  add('drawingBuffer', 'Drawing buffer');
  add('maxTextureSize', 'Max texture');
  add('drawCalls', 'Draw calls');
  add('triangles', 'Triangoli');
  add('geometries', 'Geometrie');
  add('textures', 'Texture');
  add('programs', 'Programmi');
  add('shaderErrors', 'Shader error');
  add('shaderLog', 'Shader log');
  add('colorBufferHalfFloat', 'EXT_color_buffer_half_float');
  add('colorBufferFloat', 'EXT_color_buffer_float');
  add('halfFloatLinear', 'OES_texture_half_float_linear');
  add('floatLinear', 'OES_texture_float_linear');
  add('anisotropic', 'EXT_texture_filter_anisotropic');
  add('environment', 'Env map auto');
  add('userAgent', 'User agent');
  folder.close();

  const renderDiag = { shadows: renderer.shadowMap.enabled };
  const diagFolder = gui.addFolder('Diagnostica render');
  diagFolder.add(renderDiag, 'shadows').name('Shadow map').onChange((value) => {
    renderer.shadowMap.enabled = value;
  });
  diagFolder.close();

  const bufferSize = new THREE.Vector2();
  let infoTimer = 0;

  function refreshInfo(fps) {
    info.fps = Math.round(fps);
    info.pixelRatio = renderer.getPixelRatio().toFixed(2);
    renderer.getDrawingBufferSize(bufferSize);
    info.drawingBuffer = `${bufferSize.x}x${bufferSize.y}`;
    info.drawCalls = renderer.info.render.calls;
    info.triangles = renderer.info.render.triangles;
    info.geometries = renderer.info.memory.geometries;
    info.textures = renderer.info.memory.textures;
    const programs = renderer.info.programs || [];
    info.programs = programs.length;
    let shaderErrors = 0;
    let shaderLog = '';
    for (const program of programs) {
      if (!program.diagnostics) continue;
      shaderErrors++;
      if (!shaderLog) {
        shaderLog = String(program.diagnostics.programLog || program.diagnostics.vertexShader || '').slice(0, 300);
      }
    }
    info.shaderErrors = shaderErrors;
    info.shaderLog = shaderLog;
    for (const controller of controllers) controller.updateDisplay();
  }

  function update(delta = 0, fps = 0) {
    lines.visible = settings.showPhysicsDebug;
    if (settings.showPhysicsDebug) {
      const buffers = world.debugRender();
      geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4));
      geometry.computeBoundingSphere();
    }

    infoTimer += delta;
    if (infoTimer < 0.25) return;
    infoTimer = 0;
    refreshInfo(fps);
  }

  return { update, settings, lines, info };
}

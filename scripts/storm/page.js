// Runs inside headless Chrome (see render.mjs). Builds the noise volumes once, then for
// each frame: several jittered samples added up in a float buffer, tile by tile so no
// single draw keeps the GPU busy for long, then bloom and the film curve, then a PNG.
const log = (m) => fetch("/log", { method: "POST", body: String(m) });
(async () => {
  const canvas = document.getElementById("c");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, alpha: false });
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("no float render targets");
  gl.getExtension("OES_texture_float_linear");
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  await log("GPU: " + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown"));

  const VERT = "#version 300 es\nin vec2 a;out vec2 vUv;void main(){vUv=a*0.5+0.5;gl_Position=vec4(a,0.,1.);}";
  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const program = (frag) => {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const cache = {};
    return { p, u: (name) => (cache[name] ??= gl.getUniformLocation(p, name)) };
  };
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // the tiling noise volumes, drawn a slice at a time
  const noise = program(SRC.noise);
  const fbo = gl.createFramebuffer();
  const volume = (size, kind) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(gl.TEXTURE_3D, Math.floor(Math.log2(size)) + 1, gl.RGBA8, size, size, size);
    gl.useProgram(noise.p);
    gl.uniform1f(noise.u("uSize"), size);
    gl.uniform1i(noise.u("uKind"), kind);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, size, size);
    for (let z = 0; z < size; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
      gl.uniform1f(noise.u("uZ"), (z + 0.5) / size);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.finish();
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_3D);
    return tex;
  };
  const base = volume(128, 0);
  const detail = volume(64, 1);
  await log("noise ready");

  const jobs = await (await fetch("/jobs")).json();
  const storms = {};
  const stormFor = (steps) => (storms[steps] ??= program(SRC.storm.replace("precision highp float;", `#define STEPS ${steps}\nprecision highp float;`)));
  const post = program(SRC.post);

  const target = (w, h) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, f, w, h };
  };
  const sized = {};
  const targets = (w, h) =>
    (sized[w + "x" + h] ??= {
      sum: target(w, h),
      a: target(w >> 1, h >> 1), b: target(w >> 1, h >> 1),
      c: target(w >> 2, h >> 2), d: target(w >> 2, h >> 2),
    });

  const TILES = 4;
  for (let j = 0; j < jobs.length; j++) {
    const job = jobs[j];
    const { w, h } = job;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const T = targets(w, h);
    const storm = stormFor(job.steps);
    gl.useProgram(storm.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, base);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, detail);
    gl.uniform1i(storm.u("uBase"), 0);
    gl.uniform1i(storm.u("uDetail"), 1);
    gl.uniform2f(storm.u("uRes"), w, h);
    gl.uniform1i(storm.u("uMode"), job.mode);
    gl.uniform1f(storm.u("uSun"), job.sun);
    gl.uniform1f(storm.u("uWhite"), job.white ?? 0);
    gl.uniform4fv(storm.u("uEye"), job.eye ?? [0, 0, 0, 0]);
    const lights = job.lights ?? [];
    gl.uniform1i(storm.u("uNL"), lights.length);
    if (lights.length) {
      gl.uniform4fv(storm.u("uLightP"), lights.flatMap((l) => l.p));
      gl.uniform4fv(storm.u("uLightC"), lights.flatMap((l) => l.c));
    }
    const segs = job.segs ?? [];
    gl.uniform1i(storm.u("uNS"), segs.length);
    if (segs.length) {
      gl.uniform4fv(storm.u("uSegA"), segs.flatMap((s) => s.a));
      gl.uniform4fv(storm.u("uSegB"), segs.flatMap((s) => s.b));
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, T.sum.f);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.SCISSOR_TEST);
    for (let s = 0; s < job.samples; s++) {
      // each sample: its own place inside the pixel, its own step offsets, and (for the
      // fast clip) its own instant inside the shutter, which is what blurs the motion
      const k = (s + 0.5) / job.samples;
      gl.uniform2f(storm.u("uJit"), ((s * 0.754877) % 1) - 0.5, ((s * 0.569840) % 1) - 0.5);
      gl.uniform1f(storm.u("uSeed"), s);
      gl.uniform1f(storm.u("uU"), job.u + (job.shutter ?? 0) * (k - 0.5));
      for (let ty = 0; ty < TILES; ty++)
        for (let tx = 0; tx < TILES; tx++) {
          const x0 = Math.floor((tx * w) / TILES), x1 = Math.floor(((tx + 1) * w) / TILES);
          const y0 = Math.floor((ty * h) / TILES), y1 = Math.floor(((ty + 1) * h) / TILES);
          gl.bindFramebuffer(gl.FRAMEBUFFER, T.sum.f);
          gl.scissor(x0, y0, x1 - x0, y1 - y0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.finish();
          await new Promise((r) => setTimeout(r, 0));
        }
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);

    gl.useProgram(post.p);
    // nothing we are about to draw into may still be bound for reading
    for (const unit of [2, 3, 4]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.uniform1f(post.u("uExposure"), job.exposure / job.samples);
    gl.uniform1f(post.u("uKnee"), job.sun ? 0.75 : 0.35);
    gl.uniform1f(post.u("uBloom"), job.bloom);
    gl.uniform1f(post.u("uSunny"), job.sun);
    const pass = (stage, to, a, dir = [0, 0], b = null, c = null) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.f : null);
      gl.viewport(0, 0, to ? to.w : w, to ? to.h : h);
      gl.uniform1i(post.u("uStage"), stage);
      gl.uniform2f(post.u("uDir"), dir[0], dir[1]);
      [a, b, c].forEach((t, i) => {
        gl.activeTexture(gl.TEXTURE2 + i);
        gl.bindTexture(gl.TEXTURE_2D, t ? t.tex : null);
        if (!t) return;
        gl.uniform1i(post.u(["uA", "uB", "uC"][i]), 2 + i);
      });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    pass(0, T.a, T.sum);
    pass(1, T.b, T.a, [1 / T.a.w, 0]);
    pass(1, T.a, T.b, [0, 1 / T.a.h]);
    pass(1, T.d, T.a, [1.5 / T.c.w, 0]);
    pass(1, T.c, T.d, [0, 1.5 / T.c.h]);
    pass(2, null, T.sum, [0, 0], T.a, T.c);
    gl.finish();

    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    await fetch("/frame/" + j, { method: "POST", body: blob });
  }
  await fetch("/done", { method: "POST" });
})().catch((e) => log("ERROR " + e.message).then(() => fetch("/done", { method: "POST" })));

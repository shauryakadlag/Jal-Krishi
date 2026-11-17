"use client";

import { useEffect, useRef } from "react";

// WebGL Vertex Shader
const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// WebGL Fragment Shader: 3D Crystal-Clear Realistic Water Surface
// Features: Multiple 3D Gerstner wave harmonics, surface normal reconstruction, 
// Fresnel reflectance, specular sun glint, caustic light patterns, and depth color absorption.
const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dark_mode; // 0.0 = light, 1.0 = dark

varying vec2 v_uv;

// Pseudo-random and 2D rotation helpers
mat2 rotate2D(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

// 3D Wave elevation function combining multiple Gerstner-style harmonic directional waves
float waveHeight(vec2 pos, float time) {
  float h = 0.0;
  
  // Wave 1: Primary gentle ocean swell (North-East direction)
  vec2 d1 = normalize(vec2(0.8, 0.6));
  float k1 = 5.5;
  float w1 = 1.2;
  h += sin(dot(d1, pos) * k1 + time * w1) * 0.16;
  
  // Wave 2: Secondary crossing wave (South-East direction)
  vec2 d2 = normalize(vec2(0.6, -0.7));
  float k2 = 9.2;
  float w2 = 1.7;
  h += sin(dot(d2, pos) * k2 + time * w2 + 1.4) * 0.10;
  
  // Wave 3: Faster intermediate chop
  vec2 d3 = normalize(vec2(-0.7, 0.5));
  float k3 = 16.0;
  float w3 = 2.4;
  h += sin(dot(d3, pos) * k3 + time * w3 + 2.7) * 0.06;
  
  // Wave 4: Fine high-frequency water surface ripple
  vec2 d4 = normalize(vec2(0.3, 0.9));
  float k4 = 28.0;
  float w4 = 3.6;
  h += sin(dot(d4, pos) * k4 + time * w4 + 4.1) * 0.035;

  // Wave 5: Micro-texture turbulence
  vec2 d5 = normalize(vec2(-0.8, -0.4));
  float k5 = 45.0;
  float w5 = 4.8;
  h += sin(dot(d5, pos) * k5 + time * w5 + 0.8) * 0.018;

  return h;
}

// Compute 3D surface normal vector via central finite differences of the wave elevation field
vec3 computeNormal(vec2 pos, float time) {
  float eps = 0.012;
  float hL = waveHeight(pos - vec2(eps, 0.0), time);
  float hR = waveHeight(pos + vec2(eps, 0.0), time);
  float hD = waveHeight(pos - vec2(0.0, eps), time);
  float hU = waveHeight(pos + vec2(0.0, eps), time);
  
  // Slope in X and Y
  float dx = (hR - hL) / (2.0 * eps);
  float dy = (hU - hD) / (2.0 * eps);
  
  // Surface normal (perturbed upward Z-axis)
  return normalize(vec3(-dx * 2.2, -dy * 2.2, 1.0));
}

// Simulates underwater light caustics focused by curved waves
float calculateCaustics(vec2 pos, float time) {
  vec2 p = pos * 8.0;
  vec2 p1 = p + vec2(time * 0.5, time * 0.3);
  vec2 p2 = rotate2D(0.8) * p - vec2(time * 0.4, time * 0.6);
  
  float c1 = sin(p1.x + sin(p1.y * 1.5 + time * 0.8));
  float c2 = cos(p2.x * 1.3 + sin(p2.y + time * 0.6));
  float caustic = pow(clamp(0.5 + 0.5 * (c1 + c2), 0.0, 1.0), 3.0);
  return caustic;
}

void main() {
  // Normalize aspect ratio coordinates
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 3.2;

  float time = u_time * 0.65;

  // Compute 3D wave height and normal vector
  float height = waveHeight(p, time);
  vec3 normal = computeNormal(p, time);

  // Top-down camera / viewing ray (pointing straight down into water)
  vec3 eyeVec = vec3(0.0, 0.0, 1.0);

  // Sunlight illumination direction: coming from upper-right angle
  vec3 sunDir = normalize(vec3(0.45, 0.65, 0.75));

  // Diffuse illumination on waves
  float diffuse = max(dot(normal, sunDir), 0.0);

  // Specular reflection: Blinn-Phong highlight
  vec3 halfVec = normalize(sunDir + eyeVec);
  float specBase = max(dot(normal, halfVec), 0.0);
  float specular = pow(specBase, 64.0) * 1.8;
  float broadSpec = pow(specBase, 12.0) * 0.4;

  // Fresnel reflectance: Schlick's approximation for water (F0 ≈ 0.02)
  float cosTheta = clamp(dot(normal, eyeVec), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 3.5);

  // Caustics intensity
  float caustic = calculateCaustics(p, time);

  // Color Palette Definitions
  // Light Theme: Pristine, bright crystal-clear aqua water
  vec3 lightDeepWater    = vec3(0.45, 0.84, 0.91); // #73D7E8
  vec3 lightShallowWater = vec3(0.78, 0.96, 0.98); // #C7F5FA
  vec3 lightWaveCrest    = vec3(0.92, 0.99, 1.00); // Highlight foam crest
  vec3 lightSunColor     = vec3(1.00, 1.00, 0.96); // Warm sunlight

  // Dark Theme: Deep translucent aqua water with bioluminescent cyan reflection
  vec3 darkDeepWater     = vec3(0.015, 0.075, 0.115); // #04131D
  vec3 darkShallowWater  = vec3(0.035, 0.170, 0.220); // #092B38
  vec3 darkWaveCrest     = vec3(0.180, 0.780, 0.820); // Cyan crest highlight
  vec3 darkSunColor      = vec3(0.350, 0.920, 0.980); // Cyan reflection

  // Blend palettes based on active theme
  vec3 deepWater    = mix(lightDeepWater, darkDeepWater, u_dark_mode);
  vec3 shallowWater = mix(lightShallowWater, darkShallowWater, u_dark_mode);
  vec3 crestColor   = mix(lightWaveCrest, darkWaveCrest, u_dark_mode);
  vec3 sunColor     = mix(lightSunColor, darkSunColor, u_dark_mode);

  // Base water color from wave depth & normal inclination
  float depthFactor = clamp(0.5 + height * 1.8, 0.0, 1.0);
  vec3 baseColor = mix(deepWater, shallowWater, depthFactor);

  // Add subtle sunlight diffuse shaping
  baseColor += diffuse * (crestColor - baseColor) * 0.35;

  // Add submerged caustics (focused rays of light refracted through surface)
  float causticStrength = mix(0.18, 0.12, u_dark_mode);
  baseColor += caustic * causticStrength * crestColor;

  // Add wave crest light scattering
  float crestHighlight = smoothstep(0.12, 0.22, height);
  baseColor = mix(baseColor, crestColor, crestHighlight * 0.45);

  // Add Fresnel surface reflection and sun specular highlights
  vec3 finalColor = mix(baseColor, crestColor, fresnel * 0.65);
  finalColor += (specular + broadSpec) * sunColor;

  // Smooth vignette around borders to ensure gentle fade behind UI
  float edgeDist = length(uv - 0.5);
  float vignette = smoothstep(0.85, 0.3, edgeDist);
  finalColor = mix(deepWater, finalColor, 0.85 + 0.15 * vignette);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export default function RealisticWaterCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isReducedMotion = mediaQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      isReducedMotion = e.matches;
    };
    mediaQuery.addEventListener("change", handleMotionChange);

    const gl = (canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
    }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

    if (!gl) {
      console.warn("WebGL not supported; falling back to CSS water surface.");
      return;
    }

    // Compile helper
    const compileShader = (type: number, src: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Fullscreen quad buffer [-1, -1] to [1, 1]
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uDarkMode = gl.getUniformLocation(program, "u_dark_mode");

    let animationFrameId: number;
    let startTime = performance.now();
    let lastRenderTime = 0;

    // Viewport resize handling (with devicePixelRatio capping for battery/smooth 60fps)
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.floor(window.innerWidth * dpr);
      const height = Math.floor(window.innerHeight * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Render loop
    const render = (now: number) => {
      // If user requested reduced motion, clamp time updates to freeze movement
      const elapsed = isReducedMotion ? 10.0 : (now - startTime) * 0.001;

      // Throttle rendering if browser tab is hidden or rendering faster than 60fps
      if (now - lastRenderTime >= 15) {
        lastRenderTime = now;

        const isDark = document.documentElement.classList.contains("dark") ? 1.0 : 0.0;

        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, elapsed);
        gl.uniform1f(uDarkMode, isDark);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      mediaQuery.removeEventListener("change", handleMotionChange);
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
      if (program) gl.deleteProgram(program);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10 pointer-events-none transition-opacity duration-700"
      aria-hidden="true"
    />
  );
}
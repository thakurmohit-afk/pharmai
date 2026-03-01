import { useEffect, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';

interface ShaderBackgroundProps {
    colors?: [string, string, string];
    className?: string; // Add className for easier positioning
}

// Convert hex color to HSL values for spectral modulation
const hexToHsl = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [0.5, 0.5, 0.5];

    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
};

const ShaderBackground = ({ colors, className }: ShaderBackgroundProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext('webgl');
        if (!gl) return;

        // Vertex shader source
        const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

        // Fragment shader source with original spectral function + modulation
        const fragmentShaderSource = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform float uHueShift;
      uniform float uSaturation;
      uniform float uBrightness;

      vec3 spectral_colour(float l) {
        float r=0.0,g=0.0,b=0.0;
        if ((l>=400.0)&&(l<410.0)) { float t=(l-400.0)/(410.0-400.0); r=+(0.33*t)-(0.20*t*t); }
        else if ((l>=410.0)&&(l<475.0)) { float t=(l-410.0)/(475.0-410.0); r=0.14-(0.13*t*t); }
        else if ((l>=545.0)&&(l<595.0)) { float t=(l-545.0)/(595.0-545.0); r=+(1.98*t)-(t*t); }
        else if ((l>=595.0)&&(l<650.0)) { float t=(l-595.0)/(650.0-595.0); r=0.98+(0.06*t)-(0.40*t*t); }
        else if ((l>=650.0)&&(l<700.0)) { float t=(l-650.0)/(700.0-650.0); r=0.65-(0.84*t)+(0.20*t*t); }
        if ((l>=415.0)&&(l<475.0)) { float t=(l-415.0)/(475.0-415.0); g=+(0.80*t*t); }
        else if ((l>=475.0)&&(l<590.0)) { float t=(l-475.0)/(590.0-475.0); g=0.8+(0.76*t)-(0.80*t*t); }
        else if ((l>=585.0)&&(l<639.0)) { float t=(l-585.0)/(639.0-585.0); g=0.82-(0.80*t); }
        if ((l>=400.0)&&(l<475.0)) { float t=(l-400.0)/(475.0-400.0); b=+(2.20*t)-(1.50*t*t); }
        else if ((l>=475.0)&&(l<560.0)) { float t=(l-475.0)/(560.0-475.0); b=0.7-(t)+(0.30*t*t); }
        return vec3(r,g,b);
      }

      // HSV to RGB conversion
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      // RGB to HSV conversion
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      void main() {
        vec2 fragCoord = gl_FragCoord.xy;
        vec2 p = (2.0*fragCoord.xy - iResolution.xy) / min(iResolution.x, iResolution.y);
        p *= 0.8; // Zoomed in for softer gradients
        
        for(int i=0;i<8;i++) {
          vec2 newp = vec2(
            p.y + cos(p.x + iTime) - sin(p.y * cos(iTime * 0.2)),
            p.x - sin(p.y - iTime) - cos(p.x * sin(iTime * 0.3))
          );
          p = newp;
        }
        
        // Get original spectral color
        vec3 spectralColor = spectral_colour(p.y * 50.0 + 500.0 + sin(iTime * 0.6));
        
        // Convert to HSV for modulation
        vec3 hsv = rgb2hsv(spectralColor);
        
        // Apply modulations
        hsv.x = fract(hsv.x + uHueShift); // Hue shift
        hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0); // Saturation
        hsv.z = clamp(hsv.z * uBrightness, 0.0, 1.0); // Brightness
        
        // Convert back to RGB
        vec3 finalColor = hsv2rgb(hsv);
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

        // Create shader function
        const createShader = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        // Create program
        const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        if (!vertexShader || !fragmentShader) return;

        const program = gl.createProgram();
        if (!program) return;

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return;
        }

        // Set up geometry and uniforms
        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const resolutionLocation = gl.getUniformLocation(program, 'iResolution');
        const timeLocation = gl.getUniformLocation(program, 'iTime');
        const hueShiftLocation = gl.getUniformLocation(program, 'uHueShift');
        const saturationLocation = gl.getUniformLocation(program, 'uSaturation');
        const brightnessLocation = gl.getUniformLocation(program, 'uBrightness');

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1,
        ]), gl.STATIC_DRAW);

        // Initial Resize
        let width = canvas.parentElement?.clientWidth || window.innerWidth;
        let height = canvas.parentElement?.clientHeight || window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);

        // Setup Resize Observer for auto-responsiveness
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                width = entry.contentRect.width;
                height = entry.contentRect.height;
                canvas.width = width;
                canvas.height = height;
                gl.viewport(0, 0, width, height);
            }
        });
        if (canvas.parentElement) {
            resizeObserver.observe(canvas.parentElement);
        }

        // Convert colors to modulation parameters
        const defaultHsl1 = [0.0, 1.0, 1.0]; // Default values
        const defaultHsl2 = [0.0, 1.0, 1.0];
        const defaultHsl3 = [0.0, 1.0, 1.0];

        const hsl1 = colors ? hexToHsl(colors[0]) : defaultHsl1;
        const hsl2 = colors ? hexToHsl(colors[1]) : defaultHsl2;
        const hsl3 = colors ? hexToHsl(colors[2]) : defaultHsl3;

        // Use the colors to control spectral parameters
        const hueShift = hsl1[0]; // Use first color's hue for hue shift
        const saturation = hsl2[1] + 0.5; // Use second color's saturation (offset for visibility)
        const brightness = hsl3[2] + 0.5; // Use third color's lightness (offset for visibility)

        // Render function
        const render = (time: number) => {
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.useProgram(program);

            gl.enableVertexAttribArray(positionLocation);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

            gl.uniform2f(resolutionLocation, width, height);
            gl.uniform1f(timeLocation, time * 0.0003);
            gl.uniform1f(hueShiftLocation, hueShift);
            gl.uniform1f(saturationLocation, saturation);
            gl.uniform1f(brightnessLocation, brightness);

            gl.drawArrays(gl.TRIANGLES, 0, 6);

            animationRef.current = requestAnimationFrame(render);
        };

        animationRef.current = requestAnimationFrame(render);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            resizeObserver.disconnect();
        };
    }, [colors]);

    return (
        <canvas
            ref={canvasRef}
            className={className || "absolute inset-0"}
            style={{ display: 'block', width: '100%', height: '100%' }}
        />
    );
};

export default ShaderBackground;

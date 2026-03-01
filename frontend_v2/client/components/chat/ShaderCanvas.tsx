import { useEffect, useRef, useState } from "react";
import { shaders, vertexShader } from "@/lib/shaders";
import { cn } from "@/lib/utils";

interface ShaderCanvasProps {
    size?: number;
    onClick?: () => void;
    isListening?: boolean;
    isSpeaking?: boolean;
    shaderId?: number;
    className?: string;
}

export const ShaderCanvas = ({
    size = 300,
    onClick,
    isListening = false,
    isSpeaking = false,
    shaderId = 1,
    className
}: ShaderCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);
    const mousePositionRef = useRef<[number, number]>([0.5, 0.5]);
    const programInfoRef = useRef<any>(null);
    const [isHovered, setIsHovered] = useState(false);

    // Get the selected shader
    const selectedShader = shaders.find((s) => s.id === shaderId) || shaders[0];

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        mousePositionRef.current = [x, y];
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext("webgl");
        if (!gl) {
            console.error("WebGL not supported");
            return;
        }

        const vsSource = vertexShader;
        const fsSource = selectedShader.fragmentShader;

        const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
        if (!shaderProgram) return;

        programInfoRef.current = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
                textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
            },
            uniformLocations: {
                iResolution: gl.getUniformLocation(shaderProgram, "iResolution"),
                iTime: gl.getUniformLocation(shaderProgram, "iTime"),
                iMouse: gl.getUniformLocation(shaderProgram, "iMouse"),
                hasActiveReminders: gl.getUniformLocation(shaderProgram, "hasActiveReminders"),
                hasUpcomingReminders: gl.getUniformLocation(shaderProgram, "hasUpcomingReminders"),
                disableCenterDimming: gl.getUniformLocation(shaderProgram, "disableCenterDimming"),
            },
        };

        const buffers = initBuffers(gl);
        let startTime = Date.now();

        canvas.width = size;
        canvas.height = size;
        gl.viewport(0, 0, canvas.width, canvas.height);

        const render = () => {
            const currentTime = (Date.now() - startTime) / 1000;
            const mousePos = mousePositionRef.current;

            drawScene(
                gl!,
                programInfoRef.current,
                buffers,
                currentTime,
                canvas.width,
                canvas.height,
                isListening, // pass isListening as 'hasActiveReminders' to make it glow blue
                isSpeaking,  // pass isSpeaking as 'hasUpcomingReminders' to make it glow green
                mousePos
            );
            animationRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationRef.current);
            if (gl && shaderProgram) {
                gl.deleteProgram(shaderProgram);
            }
        };
    }, [size, isListening, isSpeaking, shaderId, selectedShader.fragmentShader]);

    function initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
        const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vertexShader || !fragmentShader) return null;

        const shaderProgram = gl.createProgram();
        if (!shaderProgram) return null;
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) return null;
        return shaderProgram;
    }

    function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function initBuffers(gl: WebGLRenderingContext) {
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positions = [-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const textureCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
        const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        const indices = [0, 1, 2, 0, 2, 3];
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        return { position: positionBuffer, textureCoord: textureCoordBuffer, indices: indexBuffer };
    }

    function drawScene(
        gl: WebGLRenderingContext,
        programInfo: any,
        buffers: any,
        currentTime: number,
        width: number,
        height: number,
        hasActiveReminders: boolean,
        hasUpcomingReminders: boolean,
        mousePos: [number, number]
    ) {
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(programInfo.program);
        gl.uniform2f(programInfo.uniformLocations.iResolution, width, height);
        gl.uniform1f(programInfo.uniformLocations.iTime, currentTime);
        gl.uniform2f(programInfo.uniformLocations.iMouse, mousePos[0], mousePos[1]);
        gl.uniform1i(programInfo.uniformLocations.hasActiveReminders, hasActiveReminders ? 1 : 0);
        gl.uniform1i(programInfo.uniformLocations.hasUpcomingReminders, hasUpcomingReminders ? 1 : 0);
        // Force entirely disable center dimming so the glowing center is fully visible for voice
        gl.uniform1i(programInfo.uniformLocations.disableCenterDimming, 1);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
        gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    const handleMouseLeave = () => {
        setIsHovered(false);
        mousePositionRef.current = [0.5, 0.5];
    };

    return (
        <canvas
            ref={canvasRef}
            className={cn("rounded-full transition-transform duration-300", className)}
            style={{
                width: size,
                height: size,
                transform: isHovered ? "scale(1.05)" : isListening ? "scale(1.02)" : "scale(1)",
                cursor: "pointer",
                boxShadow: isListening
                    ? "0 0 40px rgba(66, 153, 225, 0.5)"
                    : isSpeaking
                        ? "0 0 40px rgba(16, 185, 129, 0.4)"
                        : "none",
            }}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
        />
    );
};

import React, { useEffect, useRef } from 'react';

// --- HalftonePattern Class ---
class HalftonePattern {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    mouse: { x: number; y: number };
    animationId: number | null;
    startTime: number;
    settings: any;

    constructor(canvasId: string, options = {}) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.mouse = { x: 0, y: 0 };
        this.animationId = null;
        this.startTime = Date.now();

        // Pattern settings (current configuration)
        this.settings = {
            density: 35,
            size: 35,
            intensity: 65,
            speed: 0.4,
            dotShape: 'circle',
            animationEffect: 'noise',
            backgroundColor: '#000000',
            foregroundColor: '#ffffff',
            isAnimated: true,
            mouseInteractive: true,
            morphing: false,
            ...options
        };

        this.init();
    }

    init() {
        this.resizeCanvas();
        this.bindEvents();
        this.animate();
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resizeCanvas());

        if (this.settings.mouseInteractive) {
            this.canvas.addEventListener('mousemove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                this.mouse.x = e.clientX - rect.left;
                this.mouse.y = e.clientY - rect.top;
            });
        }
    }

    drawShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: string) {
        ctx.save();
        ctx.translate(x, y);

        switch (shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'square':
                ctx.fillRect(-size / 2, -size / 2, size, size);
                break;

            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(0, -size / 2);
                ctx.lineTo(-size / 2, size / 2);
                ctx.lineTo(size / 2, size / 2);
                ctx.closePath();
                ctx.fill();
                break;

            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(0, -size / 2);
                ctx.lineTo(size / 2, 0);
                ctx.lineTo(0, size / 2);
                ctx.lineTo(-size / 2, 0);
                ctx.closePath();
                ctx.fill();
                break;
        }

        ctx.restore();
    }

    draw() {
        const { canvas, ctx, settings } = this;
        const time = Date.now() - this.startTime;

        // Clear canvas
        ctx.fillStyle = settings.backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const spacing = Math.max(10, 100 - settings.density);
        const dotSize = Math.max(1, settings.size * 0.3);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2);

        for (let x = 0; x < canvas.width + spacing; x += spacing) {
            for (let y = 0; y < canvas.height + spacing; y += spacing) {
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

                // Mouse interaction
                let mouseInfluence = 1;
                if (settings.mouseInteractive) {
                    const mouseDist = Math.sqrt((x - this.mouse.x) ** 2 + (y - this.mouse.y) ** 2);
                    mouseInfluence = 1 + Math.max(0, (100 - mouseDist) / 100) * 2;
                }

                // Animation
                let animationFactor = 1;
                if (settings.isAnimated) {
                    animationFactor = 0.5 + 0.5 * Math.sin(time * 0.003 * settings.speed + distance * 0.01);
                }

                // Calculate final size
                const intensity = settings.intensity / 100;
                const gradientFactor = 1 - (distance / maxDistance) * intensity;
                const finalSize = dotSize * gradientFactor * animationFactor * mouseInfluence;

                if (finalSize > 0.5) {
                    ctx.fillStyle = settings.foregroundColor;
                    this.drawShape(ctx, x, y, finalSize, settings.dotShape);
                }
            }
        }
    }

    animate() {
        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        window.removeEventListener('resize', () => this.resizeCanvas());
    }

    updateSettings(newSettings: any) {
        this.settings = { ...this.settings, ...newSettings };
    }
}

// --- React Component Wrapper ---

interface HalftonePatternComponentProps {
    density?: number;
    size?: number;
    intensity?: number;
    speed?: number;
    backgroundColor?: string;
    foregroundColor?: string;
    isAnimated?: boolean;
    dotShape?: 'circle' | 'triangle' | 'square' | 'diamond';
    animationEffect?: string;
    mouseInteractive?: boolean;
    morphing?: boolean;
    className?: string; // allow tailwind classes
}

const HalftoneBackground: React.FC<HalftonePatternComponentProps> = ({
    density = 50,
    size = 40,
    intensity = 70,
    speed = 0.4,
    backgroundColor = 'transparent', // Make it transparent to overlay
    foregroundColor = 'rgba(255, 255, 255, 0.05)', // Subtle white dots
    isAnimated = true,
    dotShape = 'circle',
    animationEffect = 'noise',
    mouseInteractive = true,
    morphing = false,
    className = ""
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const patternRef = useRef<any>(null);

    useEffect(() => {
        if (canvasRef.current) {
            // Create unique ID for canvas
            const canvasId = 'halftone-' + Math.random().toString(36).substr(2, 9);
            canvasRef.current.id = canvasId;

            // Initialize pattern
            patternRef.current = new HalftonePattern(canvasId, {
                density,
                size,
                intensity,
                speed,
                backgroundColor,
                foregroundColor,
                isAnimated,
                dotShape,
                animationEffect,
                mouseInteractive,
                morphing
            });
        }

        return () => {
            if (patternRef.current) {
                patternRef.current.destroy();
            }
        };
    }, []);

    useEffect(() => {
        if (patternRef.current) {
            patternRef.current.updateSettings({
                density,
                size,
                intensity,
                speed,
                backgroundColor,
                foregroundColor,
                isAnimated,
                dotShape,
                animationEffect,
                mouseInteractive,
                morphing
            });
        }
    }, [density, size, intensity, speed, backgroundColor, foregroundColor, isAnimated, dotShape, animationEffect, mouseInteractive, morphing]);

    return (
        <div className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}>
            <canvas
                ref={canvasRef}
                className="w-full h-full block"
            />
        </div>
    );
};

export default HalftoneBackground;

import { useEffect, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';

interface TubesCursorBackgroundProps {
    className?: string;
    colors?: string[];
    lightsColors?: string[];
}

const TubesCursorBackground = ({
    className,
    colors = ["#f967fb", "#53bc28", "#6958d5"],
    lightsColors = ["#83f36e", "#fe8a2e", "#ff008a", "#60aed5"]
}: TubesCursorBackgroundProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();

    useEffect(() => {
        // Only initialize in dark mode
        if (theme !== 'dark' || !canvasRef.current) return;

        let app: any = null;

        const initTubes = async () => {
            try {
                // Dynamically import the TubesCursor module from the CDN
                const module = await import("https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js");
                const TubesCursor = module.default;

                if (canvasRef.current) {
                    app = TubesCursor(canvasRef.current, {
                        tubes: {
                            colors: colors,
                            lights: {
                                intensity: 200,
                                colors: lightsColors
                            }
                        }
                    });
                }
            } catch (error) {
                console.error("Failed to load TubesCursor from CDN:", error);
            }
        };

        initTubes();

        return () => {
            if (app && typeof app.dispose === 'function') {
                app.dispose();
            }
        };
    }, [theme, colors, lightsColors]);

    return (
        <div ref={containerRef} className={`absolute inset-0 overflow-hidden ${className || ''}`}>
            <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ display: 'block' }}
            />
        </div>
    );
};

export default TubesCursorBackground;

import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { ReactNode } from "react";

const pageVariants = {
    initial: {
        opacity: 0,
        y: 12,
    },
    animate: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.35,
            ease: "easeOut" as const,
        },
    },
    exit: {
        opacity: 0,
        y: -8,
        transition: {
            duration: 0.2,
            ease: "easeIn" as const,
        },
    },
};

export default function AnimatedPage({ children }: { children: ReactNode }) {
    const location = useLocation();
    return (
        <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
        >
            {children}
        </motion.div>
    );
}

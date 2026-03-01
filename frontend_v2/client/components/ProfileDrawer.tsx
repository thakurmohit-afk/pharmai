import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { X, Camera, Save, Activity } from "lucide-react";
import { updateMyProfile } from "@/services/api";

interface ProfileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    profile?: any;
}

export default function ProfileDrawer({ isOpen, onClose, profile }: ProfileDrawerProps) {
    const { theme } = useTheme();

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        age: "",
        gender: "Prefer not to say",
        chronicConditions: "",
    });

    // Sync formData with incoming profile
    useEffect(() => {
        if (profile) {
            setFormData({
                name: profile.name || "",
                phone: profile.phone || "",
                age: profile.age?.toString() || "",
                gender: profile.gender || "Prefer not to say",
                chronicConditions: Array.isArray(profile.chronic_conditions)
                    ? profile.chronic_conditions.join(", ")
                    : (profile.chronic_conditions || ""),
            });
        }
    }, [profile]);

    const handleSave = async () => {
        try {
            await updateMyProfile({
                name: formData.name,
                phone: formData.phone,
                age: formData.age ? parseInt(formData.age, 10) : null,
                gender: formData.gender,
                chronic_conditions: formData.chronicConditions
                    ? formData.chronicConditions.split(',').map(s => s.trim()).filter(Boolean)
                    : []
            });
            setIsEditing(false);
            window.location.reload(); // Quick refresh to get new context
        } catch (error) {
            console.error("Failed to update profile", error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            <div
                className={cn(
                    "relative w-full max-w-md h-full shadow-2xl flex flex-col transition-transform duration-300 transform translate-x-0 border-l",
                    theme === "dark" ? "bg-slate-900 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
                )}
            >
                {/* Header */}
                <div className={cn("px-6 py-4 flex items-center justify-between border-b", theme === "dark" ? "border-white/10" : "border-slate-100")}>
                    <h2 className="text-xl font-heading font-bold">Health Profile</h2>
                    <button
                        onClick={onClose}
                        className={cn(
                            "p-2 rounded-full transition-colors",
                            theme === "dark" ? "hover:bg-slate-800" : "hover:bg-slate-100"
                        )}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Hero area */}
                    <div className="relative px-6 py-8 flex flex-col items-center border-b border-transparent">
                        <div className="relative mb-4 group cursor-pointer">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-teal-400 p-1">
                                <div className={cn("w-full h-full rounded-full flex items-center justify-center font-bold text-3xl", theme === "dark" ? "bg-slate-900" : "bg-white")}>
                                    <span className="bg-clip-text text-transparent bg-gradient-to-br from-indigo-500 to-teal-400">
                                        {formData.name.charAt(0) || "U"}
                                    </span>
                                </div>
                            </div>
                            <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                        </div>

                        {!isEditing ? (
                            <div className="text-center">
                                <h3 className="text-xl font-bold">{formData.name}</h3>
                                <p className={cn("text-sm mt-1", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                                    {profile?.email}
                                </p>
                            </div>
                        ) : (
                            <div className="w-full space-y-3 mt-2">
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className={cn(
                                        "w-full px-4 py-2 text-center rounded-xl font-bold text-lg focus:outline-none focus:ring-2",
                                        theme === "dark" ? "bg-slate-800 border-transparent focus:ring-indigo-500" : "bg-slate-100 border-transparent focus:ring-indigo-500"
                                    )}
                                    placeholder="Full Name"
                                />
                            </div>
                        )}
                    </div>

                    <div className="p-6 space-y-8">
                        {/* Personal Info */}
                        <section className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className={cn("text-sm font-semibold uppercase tracking-wider", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                    Personal Information
                                </h4>
                                {!isEditing && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="text-xs font-semibold text-indigo-500 hover:text-indigo-600"
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5 p-3 rounded-xl border border-transparent bg-slate-50 dark:bg-slate-800/50">
                                    <label className={cn("text-xs font-medium", theme === "dark" ? "text-slate-500" : "text-slate-500")}>Phone</label>
                                    {!isEditing ? (
                                        <p className="font-medium text-sm">{formData.phone || "Not set"}</p>
                                    ) : (
                                        <input
                                            type="text"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="w-full bg-transparent border-b border-indigo-500 focus:outline-none text-sm font-medium pb-1"
                                        />
                                    )}
                                </div>
                                <div className="space-y-1.5 p-3 rounded-xl border border-transparent bg-slate-50 dark:bg-slate-800/50">
                                    <label className={cn("text-xs font-medium", theme === "dark" ? "text-slate-500" : "text-slate-500")}>Age</label>
                                    {!isEditing ? (
                                        <p className="font-medium text-sm">{formData.age || "Not set"}</p>
                                    ) : (
                                        <input
                                            type="number"
                                            value={formData.age}
                                            onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                            className="w-full bg-transparent border-b border-indigo-500 focus:outline-none text-sm font-medium pb-1"
                                        />
                                    )}
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h4 className={cn("text-sm font-semibold uppercase tracking-wider", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                Chronic Conditions
                            </h4>
                            <div className="p-4 rounded-xl border border-transparent bg-indigo-50 dark:bg-indigo-500/10 flex items-start gap-3">
                                <Activity className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    {!isEditing ? (
                                        <div className="flex flex-wrap gap-2">
                                            {formData.chronicConditions ? (
                                                formData.chronicConditions.split(',').map((c, i) => (
                                                    <span key={i} className="px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-sm font-medium">
                                                        {c.trim()}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-sm font-medium text-slate-500">None marked</span>
                                            )}
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={formData.chronicConditions}
                                            onChange={(e) => setFormData({ ...formData, chronicConditions: e.target.value })}
                                            className="w-full bg-transparent border-b border-indigo-500 focus:outline-none text-sm font-medium pb-1"
                                            placeholder="Comma separated (e.g. Asthma, Diabetes)"
                                        />
                                    )}
                                    <p className={cn("text-xs mt-2", theme === "dark" ? "text-indigo-300/60" : "text-indigo-600/60")}>
                                        AI assistant uses this context to verify medication safety and flag contraindications.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                {isEditing && (
                    <div className={cn("p-6 border-t", theme === "dark" ? "border-white/10" : "border-slate-100")}>
                        <button
                            onClick={handleSave}
                            className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            <Save className="w-5 h-5" />
                            Save Profile
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}


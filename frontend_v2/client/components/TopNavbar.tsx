import { Search, Bell, LogOut, Settings, User as UserIcon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TopNavbarProps {
    onOpenProfileDrawer: () => void;
    profile?: any;
}

export default function TopNavbar({ onOpenProfileDrawer, profile }: TopNavbarProps) {
    const { theme } = useTheme();
    const { logout } = useAuth();

    // Fallbacks
    const name = profile?.name || "User";
    const email = profile?.email || "";
    const role = profile?.role === "admin" ? "Pharmacy Admin" : "Patient";
    const initials = name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() || "US";

    return (
        <header
            className={cn(
                "sticky top-0 z-40 w-full backdrop-blur-xl border-b premium-shadow flex items-center justify-between px-6 h-16",
                theme === "dark"
                    ? "bg-slate-950/80 border-white/5"
                    : "bg-white/80 border-slate-200"
            )}
        >
            {/* Left side: Context/Search */}
            <div className="flex items-center gap-8 flex-1">
                <h1 className="text-xl font-heading font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-teal-400">
                    PharmaDash
                </h1>

                <div className="relative w-full max-w-md hidden md:block">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        className={cn(
                            "block w-full pl-10 pr-3 py-2 border rounded-xl leading-5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
                            theme === "dark"
                                ? "bg-slate-900 border-slate-800 text-white placeholder-slate-500"
                                : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                        )}
                        placeholder="Search patients, meds, or orders... (⌘K)"
                    />
                </div>
            </div>

            {/* Right side: Actions */}
            <div className="flex items-center gap-4">
                {/* Notifications */}
                <button
                    className={cn(
                        "relative p-2 rounded-full transition-colors",
                        theme === "dark"
                            ? "text-slate-400 hover:text-white hover:bg-slate-800"
                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                    )}
                >
                    <Bell className="w-5 h-5" />
                </button>

                {/* Profile Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-3 focus:outline-none">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-semibold leading-tight">{name}</p>
                                <p className={cn("text-xs", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                                    {role}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-teal-500 flex items-center justify-center text-white font-bold premium-shadow border border-white/10">
                                {initials}
                            </div>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className={cn("w-56 rounded-xl", theme === "dark" && "border-white/10 bg-slate-900")}
                    >
                        <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium leading-none">{name}</p>
                                <p className="text-xs leading-none text-muted-foreground">{email}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onOpenProfileDrawer} className="cursor-pointer">
                            <UserIcon className="mr-2 h-4 w-4" />
                            <span>My Profile</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer hidden">
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}

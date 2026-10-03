import { cn } from "@/lib/utils";

interface ProgressProps {
    value?: number;
    className?: string;
}

export function Progress({value = 0, className}: ProgressProps) {
    const filled = Math.min(100, Math.max(0, value));

    return (
        <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
            <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{width: `${filled}%`}}
            />
        </div>
    );
}

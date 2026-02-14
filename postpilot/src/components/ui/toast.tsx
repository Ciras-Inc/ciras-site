"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { create } from "zustand";

interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

interface ToastStore {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: Math.random().toString(36) }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function toast(data: Omit<ToastData, "id">) {
  useToastStore.getState().addToast(data);
  setTimeout(() => {
    const toasts = useToastStore.getState().toasts;
    if (toasts.length > 0) {
      useToastStore.getState().removeToast(toasts[0].id);
    }
  }, 4000);
}

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right",
            t.variant === "destructive"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border-border bg-card text-card-foreground"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description && (
                <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
              )}
            </div>
            <button onClick={() => removeToast(t.id)} className="shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

import React, { createContext, useContext, useEffect, useState } from "react";

interface LocalStorageContextType {
    set: (key: string, value: any) => void;
    get: (key: string) => string | null;
}

const LocalStorageContext = createContext<LocalStorageContextType | undefined>(undefined);

interface LocalStorageProviderProps {
    children: React.ReactNode;
}

export function LocalStorageProvider({
    children,
}: LocalStorageProviderProps) {
    const value = {
        set: (key: string, value: any) => {
            localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        },
        get: (key: string) => {
            const item = localStorage.getItem(key);
            try {
                if (item !== null) {
                    return JSON.parse(item);
                }
                return null;
            } catch (error) {
                return item;
            }
        },
    }

    return (
        <LocalStorageContext.Provider value={value}>
            {children}
        </LocalStorageContext.Provider>
    );
}

export function useLocalStorage() {
    const context = useContext(LocalStorageContext);
    if (!context) {
        throw new Error("useLocalStorage must be used within LocalStorageProvider");
    }
    return context;
}

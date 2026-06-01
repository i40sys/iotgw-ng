---
name: react-19
description: This skill provides guidance for building React 19 applications with functional components and hooks. It should be used when creating components, managing state with useState/useReducer, handling side effects with useEffect, optimizing performance with useMemo/useCallback, or implementing custom hooks.
---

# React 19 Development

This skill provides patterns and best practices for building modern React 19 applications using functional components and hooks.

## Purpose

To enable building performant, maintainable React applications using the latest React 19 features, hooks patterns, and component architecture.

## When to Use

- Creating functional components with TypeScript
- Managing component state with useState or useReducer
- Handling side effects with useEffect
- Optimizing renders with useMemo and useCallback
- Building custom hooks for reusable logic
- Implementing context for global state
- Working with refs and DOM manipulation

## Core Hooks Patterns

### useState for Local State

```tsx
import { useState } from "react";

interface User {
  name: string;
  email: string;
}

function UserForm() {
  // Primitive state
  const [name, setName] = useState("");

  // Object state with explicit type
  const [user, setUser] = useState<User | null>(null);

  // Lazy initialization for expensive computations
  const [data, setData] = useState(() => computeExpensiveInitialState());

  // Update object state immutably
  const updateEmail = (email: string) => {
    setUser(prev => prev ? { ...prev, email } : null);
  };

  return (/* ... */);
}
```

### useEffect for Side Effects

```tsx
import { useEffect, useState } from "react";

function DataFetcher({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const result = await api.fetch(id);
        if (!cancelled) {
          setData(result);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    // Cleanup function prevents state updates on unmounted component
    return () => {
      cancelled = true;
    };
  }, [id]); // Re-run when id changes

  return (/* ... */);
}
```

### useMemo for Expensive Calculations

```tsx
import { useMemo, useState } from "react";

interface Item {
  id: string;
  name: string;
  value: number;
}

function ItemList({ items }: { items: Item[] }) {
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Memoize expensive sort operation
  const sortedItems = useMemo(() => {
    console.log("Sorting items...");
    return [...items].sort((a, b) =>
      sortOrder === "asc" ? a.value - b.value : b.value - a.value
    );
  }, [items, sortOrder]);

  // Memoize derived calculation
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + item.value, 0);
  }, [items]);

  return (/* ... */);
}
```

### useCallback for Stable Function References

```tsx
import { useCallback, useState } from "react";

function ParentComponent() {
  const [items, setItems] = useState<string[]>([]);

  // Memoize callback to prevent child re-renders
  const handleAdd = useCallback((item: string) => {
    setItems(prev => [...prev, item]);
  }, []);

  // Callback with dependencies
  const handleRemove = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  return <ChildComponent onAdd={handleAdd} onRemove={handleRemove} />;
}
```

### useRef for DOM and Mutable Values

```tsx
import { useRef, useEffect } from "react";

function FocusInput() {
  // DOM ref
  const inputRef = useRef<HTMLInputElement>(null);

  // Mutable value that persists across renders
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
    inputRef.current?.focus();
  }, []);

  return <input ref={inputRef} />;
}
```

### useReducer for Complex State

```tsx
import { useReducer } from "react";

interface State {
  count: number;
  step: number;
}

type Action =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "setStep"; payload: number }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + state.step };
    case "decrement":
      return { ...state, count: state.count - state.step };
    case "setStep":
      return { ...state, step: action.payload };
    case "reset":
      return { count: 0, step: 1 };
    default:
      return state;
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, { count: 0, step: 1 });

  return (
    <div>
      <p>Count: {state.count}</p>
      <button onClick={() => dispatch({ type: "increment" })}>+</button>
      <button onClick={() => dispatch({ type: "decrement" })}>-</button>
    </div>
  );
}
```

## Custom Hooks

```tsx
import { useState, useEffect, useCallback } from "react";

// Generic data fetching hook
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fetch failed");
      const json = await response.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

// Boolean toggle hook
function useToggle(initial = false) {
  const [value, setValue] = useState(initial);

  const toggle = useCallback(() => setValue(v => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);

  return { value, toggle, setTrue, setFalse };
}

// Local storage hook
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    setStoredValue(prev => {
      const valueToStore = value instanceof Function ? value(prev) : value;
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      return valueToStore;
    });
  }, [key]);

  return [storedValue, setValue] as const;
}
```

## Component Patterns

### Props Interface with Children

```tsx
import { ReactNode } from "react";

interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

function Card({ title, children, className }: CardProps) {
  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}
```

### Compound Components

```tsx
import { createContext, useContext, ReactNode } from "react";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("useTabs must be used within Tabs");
  return context;
}

function Tabs({ children, defaultTab }: { children: ReactNode; defaultTab: string }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
}

function TabList({ children }: { children: ReactNode }) {
  return <div role="tablist">{children}</div>;
}

function Tab({ value, children }: { value: string; children: ReactNode }) {
  const { activeTab, setActiveTab } = useTabs();
  return (
    <button
      role="tab"
      aria-selected={activeTab === value}
      onClick={() => setActiveTab(value)}
    >
      {children}
    </button>
  );
}

function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { activeTab } = useTabs();
  if (activeTab !== value) return null;
  return <div role="tabpanel">{children}</div>;
}

Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;
```

## Best Practices

1. **Keep components small and focused** - Single responsibility principle
2. **Lift state up only when needed** - Keep state as local as possible
3. **Use custom hooks for reusable logic** - Extract complex state logic
4. **Memoize expensive operations** - But don't over-optimize
5. **Handle loading and error states** - Always account for async states
6. **Clean up effects properly** - Return cleanup functions
7. **Type props explicitly** - Use interfaces for component props

## Common Pitfalls

- Forgetting dependencies in useEffect/useMemo/useCallback
- Creating new object/array references on every render
- Setting state in useEffect without proper dependencies (infinite loops)
- Not handling cleanup in useEffect
- Overusing useMemo/useCallback (premature optimization)

## Integration with Context7

To fetch latest React documentation, use:
- Library ID: `/websites/react_dev` or `/facebook/react`
- Topics: "hooks", "useState", "useEffect", "useMemo", "useCallback"

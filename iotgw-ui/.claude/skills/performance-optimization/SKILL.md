---
name: performance-optimization
description: This skill provides guidance for optimizing React application performance including memoization, virtualization, code splitting, and bundle optimization. Use when addressing performance issues or implementing performance-critical features.
---

# Performance Optimization

Techniques for building fast, responsive React applications.

## React Performance

### Memoization

#### React.memo

```tsx
import { memo } from "react";

interface UserCardProps {
  user: User;
  onSelect: (id: string) => void;
}

// Memoize component to prevent re-renders when props haven't changed
const UserCard = memo(function UserCard({ user, onSelect }: UserCardProps) {
  return (
    <div onClick={() => onSelect(user.id)}>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
});

// Custom comparison function
const UserCardWithCustomCompare = memo(
  function UserCard({ user, onSelect }: UserCardProps) {
    return (/* ... */);
  },
  (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render)
    return prevProps.user.id === nextProps.user.id;
  }
);
```

#### useMemo

```tsx
import { useMemo } from "react";

function DataTable({ data, filter, sortBy }: DataTableProps) {
  // Memoize expensive calculations
  const filteredData = useMemo(() => {
    return data.filter((item) => item.name.includes(filter));
  }, [data, filter]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      return a[sortBy] > b[sortBy] ? 1 : -1;
    });
  }, [filteredData, sortBy]);

  return (
    <table>
      {sortedData.map((item) => (
        <Row key={item.id} data={item} />
      ))}
    </table>
  );
}
```

#### useCallback

```tsx
import { useCallback, useState } from "react";

function ParentComponent() {
  const [items, setItems] = useState<Item[]>([]);

  // Memoize callback to prevent child re-renders
  const handleDelete = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []); // Empty deps - function identity never changes

  const handleUpdate = useCallback((id: string, data: Partial<Item>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item))
    );
  }, []);

  return (
    <div>
      {items.map((item) => (
        <MemoizedItem
          key={item.id}
          item={item}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
}
```

### When NOT to Memoize

```tsx
// DON'T memoize simple components
const SimpleText = ({ text }: { text: string }) => <span>{text}</span>;

// DON'T memoize when props always change
const AlwaysNewProps = memo(({ data }: { data: object }) => {
  // data is always a new object, memo is useless
  return <div>{JSON.stringify(data)}</div>;
});

// DON'T use useMemo for simple operations
const Expensive = ({ items }: { items: string[] }) => {
  // This is cheap, no need for useMemo
  const count = items.length;
  return <span>{count}</span>;
};
```

### Virtualization

For long lists, only render visible items:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated row height
    overscan: 5, // Extra items to render outside viewport
  });

  return (
    <div ref={parentRef} className="h-[400px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ItemRow item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### Code Splitting

```tsx
import { lazy, Suspense } from "react";

// Lazy load heavy components
const HeavyChart = lazy(() => import("./HeavyChart"));
const AdminPanel = lazy(() => import("./AdminPanel"));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/dashboard" element={<HeavyChart />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}

// Named exports require different syntax
const { HeavyComponent } = lazy(() =>
  import("./HeavyModule").then((module) => ({
    default: module.HeavyComponent,
  }))
);
```

### State Optimization

```tsx
// BAD: All children re-render on any state change
function BadComponent() {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState("light");
  const [notifications, setNotifications] = useState<Notification[]>([]);

  return (
    <div>
      <Header user={user} theme={theme} />
      <Notifications items={notifications} />
      <Content />
    </div>
  );
}

// GOOD: Split state into focused components
function GoodComponent() {
  return (
    <div>
      <UserHeader /> {/* Has its own user state */}
      <ThemeWrapper> {/* Has its own theme state */}
        <NotificationBadge /> {/* Has its own notifications state */}
        <Content />
      </ThemeWrapper>
    </div>
  );
}

// GOOD: Use context selectors or state management
function OptimizedComponent() {
  // Only re-renders when specific slice changes
  const userName = useStore((state) => state.user.name);
  return <span>{userName}</span>;
}
```

### Avoiding Re-renders

```tsx
// BAD: Creates new object every render
function BadParent() {
  return <Child style={{ color: "red" }} />;
}

// GOOD: Stable reference
const childStyle = { color: "red" };
function GoodParent() {
  return <Child style={childStyle} />;
}

// BAD: Creates new array every render
function BadList() {
  return <Select options={["a", "b", "c"]} />;
}

// GOOD: Stable reference
const options = ["a", "b", "c"];
function GoodList() {
  return <Select options={options} />;
}

// BAD: Inline function creates new reference
function BadHandler() {
  return <Button onClick={() => doSomething()} />;
}

// GOOD: Memoized callback
function GoodHandler() {
  const handleClick = useCallback(() => doSomething(), []);
  return <Button onClick={handleClick} />;
}
```

## Bundle Optimization

### Tree Shaking

```typescript
// BAD: Imports entire library
import _ from "lodash";
const result = _.debounce(fn, 300);

// GOOD: Import specific function
import debounce from "lodash/debounce";
const result = debounce(fn, 300);

// GOOD: Use lodash-es for ESM tree-shaking
import { debounce } from "lodash-es";
```

### Dynamic Imports

```typescript
// Load module only when needed
const loadHeavyModule = async () => {
  const module = await import("./heavy-module");
  return module.process(data);
};

// Conditional loading
if (isAdmin) {
  const AdminTools = await import("./AdminTools");
  AdminTools.init();
}
```

### Bundle Analysis

```typescript
// vite.config.ts
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    visualizer({
      open: true,
      filename: "dist/stats.html",
      gzipSize: true,
      brotliSize: true,
    }),
  ],
});
```

## Network Optimization

### Data Fetching

```tsx
// Prefetch data for likely navigation
const prefetchUser = () => {
  queryClient.prefetchQuery({
    queryKey: ["user", userId],
    queryFn: () => fetchUser(userId),
  });
};

// Parallel queries
const { data: user } = useQuery({ queryKey: ["user"], queryFn: fetchUser });
const { data: posts } = useQuery({ queryKey: ["posts"], queryFn: fetchPosts });

// Dependent queries
const { data: user } = useQuery({ queryKey: ["user"], queryFn: fetchUser });
const { data: posts } = useQuery({
  queryKey: ["posts", user?.id],
  queryFn: () => fetchUserPosts(user!.id),
  enabled: !!user, // Only fetch when user is available
});
```

### Image Optimization

```tsx
// Lazy load images
<img loading="lazy" src="/large-image.jpg" alt="Description" />

// Responsive images
<img
  srcSet="/image-400.jpg 400w, /image-800.jpg 800w"
  sizes="(max-width: 600px) 400px, 800px"
  src="/image-800.jpg"
  alt="Description"
/>

// Next.js Image component
import Image from "next/image";
<Image
  src="/image.jpg"
  width={800}
  height={600}
  placeholder="blur"
  priority={isAboveFold}
/>
```

## Measuring Performance

### React DevTools Profiler

```tsx
import { Profiler, ProfilerOnRenderCallback } from "react";

const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  console.log({
    id,
    phase, // "mount" | "update"
    actualDuration, // Time spent rendering
    baseDuration, // Estimated time without memoization
  });
};

function App() {
  return (
    <Profiler id="App" onRender={onRenderCallback}>
      <MainContent />
    </Profiler>
  );
}
```

### Performance Marks

```typescript
// Mark start
performance.mark("fetch-start");

await fetchData();

// Mark end and measure
performance.mark("fetch-end");
performance.measure("fetch-duration", "fetch-start", "fetch-end");

// Get measurements
const measurements = performance.getEntriesByName("fetch-duration");
console.log(measurements[0].duration);
```

### Web Vitals

```typescript
import { onCLS, onFID, onLCP } from "web-vitals";

onCLS(console.log); // Cumulative Layout Shift
onFID(console.log); // First Input Delay
onLCP(console.log); // Largest Contentful Paint
```

## Checklist

### Component Level
- [ ] Use React.memo for pure components with expensive renders
- [ ] Use useMemo for expensive calculations
- [ ] Use useCallback for callbacks passed to memoized children
- [ ] Avoid creating objects/arrays inline in JSX
- [ ] Use virtualization for long lists (>100 items)

### Application Level
- [ ] Code split routes and heavy components
- [ ] Prefetch data for likely navigations
- [ ] Use proper cache times for queries
- [ ] Implement skeleton loaders for perceived performance

### Bundle Level
- [ ] Import specific modules, not entire libraries
- [ ] Analyze bundle size regularly
- [ ] Use dynamic imports for conditional features
- [ ] Configure manual chunks for vendor splitting

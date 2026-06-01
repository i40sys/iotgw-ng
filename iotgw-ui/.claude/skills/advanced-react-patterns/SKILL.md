---
name: advanced-react-patterns
description: This skill provides guidance for advanced React patterns including compound components, render props, higher-order components, and state machines. Use when building complex, reusable component systems.
---

# Advanced React Patterns

Patterns for building flexible, reusable, and maintainable React components.

## Compound Components

Components that work together to form a cohesive unit with shared state.

```tsx
import { createContext, useContext, useState, ReactNode } from "react";

// Context for shared state
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs compound components must be used within <Tabs>");
  }
  return context;
}

// Parent component
interface TabsProps {
  defaultTab: string;
  children: ReactNode;
}

function Tabs({ defaultTab, children }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

// Tab list component
function TabList({ children }: { children: ReactNode }) {
  return <div role="tablist" className="flex gap-2">{children}</div>;
}

// Individual tab trigger
interface TabProps {
  value: string;
  children: ReactNode;
}

function Tab({ value, children }: TabProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(value)}
      className={isActive ? "font-bold" : ""}
    >
      {children}
    </button>
  );
}

// Tab content panel
interface TabPanelProps {
  value: string;
  children: ReactNode;
}

function TabPanel({ value, children }: TabPanelProps) {
  const { activeTab } = useTabsContext();
  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" className="p-4">
      {children}
    </div>
  );
}

// Attach subcomponents
Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// Usage
function App() {
  return (
    <Tabs defaultTab="overview">
      <Tabs.List>
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="settings">Settings</Tabs.Tab>
        <Tabs.Tab value="logs">Logs</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview">Overview content</Tabs.Panel>
      <Tabs.Panel value="settings">Settings content</Tabs.Panel>
      <Tabs.Panel value="logs">Logs content</Tabs.Panel>
    </Tabs>
  );
}
```

## Render Props

Pass rendering logic as a function prop.

```tsx
interface MousePosition {
  x: number;
  y: number;
}

interface MouseTrackerProps {
  render: (position: MousePosition) => ReactNode;
}

function MouseTracker({ render }: MouseTrackerProps) {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return <>{render(position)}</>;
}

// Usage
function App() {
  return (
    <MouseTracker
      render={({ x, y }) => (
        <div>
          Mouse position: {x}, {y}
        </div>
      )}
    />
  );
}

// Alternative: children as function
interface MouseTrackerAltProps {
  children: (position: MousePosition) => ReactNode;
}

function MouseTrackerAlt({ children }: MouseTrackerAltProps) {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });
  // ... same logic
  return <>{children(position)}</>;
}

// Usage
<MouseTrackerAlt>
  {({ x, y }) => <div>Position: {x}, {y}</div>}
</MouseTrackerAlt>
```

## Custom Hooks (Preferred Pattern)

Extract logic into reusable hooks.

```tsx
// useToggle hook
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback(() => setValue((v) => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);

  return { value, toggle, setTrue, setFalse };
}

// useAsync hook
interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

function useAsync<T>(asyncFn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    isLoading: true,
  });

  useEffect(() => {
    setState((s) => ({ ...s, isLoading: true }));

    asyncFn()
      .then((data) => setState({ data, error: null, isLoading: false }))
      .catch((error) => setState({ data: null, error, isLoading: false }));
  }, deps);

  return state;
}

// useLocalStorage hook
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

// useDebounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

## Higher-Order Components (HOC)

Wrap components to add functionality (less common with hooks).

```tsx
interface WithLoadingProps {
  isLoading: boolean;
}

function withLoading<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  return function WithLoadingComponent(props: P & WithLoadingProps) {
    const { isLoading, ...rest } = props;

    if (isLoading) {
      return <Spinner />;
    }

    return <WrappedComponent {...(rest as P)} />;
  };
}

// Usage
const UserListWithLoading = withLoading(UserList);

<UserListWithLoading users={users} isLoading={isLoading} />
```

## Controlled vs Uncontrolled Components

```tsx
interface InputProps {
  // Controlled props
  value?: string;
  onChange?: (value: string) => void;
  // Uncontrolled props
  defaultValue?: string;
}

function FlexibleInput({
  value: controlledValue,
  onChange,
  defaultValue = "",
}: InputProps) {
  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = useState(defaultValue);

  // Determine if controlled
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    if (!isControlled) {
      setInternalValue(newValue);
    }

    onChange?.(newValue);
  };

  return <input value={value} onChange={handleChange} />;
}

// Controlled usage
const [value, setValue] = useState("");
<FlexibleInput value={value} onChange={setValue} />

// Uncontrolled usage
<FlexibleInput defaultValue="initial" />
```

## Polymorphic Components

Components that can render as different elements.

```tsx
type AsProp<C extends React.ElementType> = {
  as?: C;
};

type PropsToOmit<C extends React.ElementType, P> = keyof (AsProp<C> & P);

type PolymorphicComponentProps<
  C extends React.ElementType,
  Props = {}
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<React.ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

interface ButtonOwnProps {
  variant?: "primary" | "secondary";
}

type ButtonProps<C extends React.ElementType = "button"> =
  PolymorphicComponentProps<C, ButtonOwnProps>;

function Button<C extends React.ElementType = "button">({
  as,
  variant = "primary",
  children,
  ...props
}: ButtonProps<C>) {
  const Component = as || "button";

  return (
    <Component
      className={variant === "primary" ? "bg-blue-500" : "bg-gray-500"}
      {...props}
    >
      {children}
    </Component>
  );
}

// Usage
<Button>Click me</Button>
<Button as="a" href="/page">Link styled as button</Button>
<Button as={Link} to="/page">Router link</Button>
```

## State Reducer Pattern

Allow users to customize state updates.

```tsx
interface State {
  count: number;
}

type Action =
  | { type: "INCREMENT" }
  | { type: "DECREMENT" }
  | { type: "RESET" };

interface UseCounterProps {
  initialCount?: number;
  stateReducer?: (state: State, action: Action) => State;
}

function defaultReducer(state: State, action: Action): State {
  switch (action.type) {
    case "INCREMENT":
      return { count: state.count + 1 };
    case "DECREMENT":
      return { count: state.count - 1 };
    case "RESET":
      return { count: 0 };
    default:
      return state;
  }
}

function useCounter({
  initialCount = 0,
  stateReducer = defaultReducer,
}: UseCounterProps = {}) {
  const [state, dispatch] = useReducer(stateReducer, { count: initialCount });

  const increment = () => dispatch({ type: "INCREMENT" });
  const decrement = () => dispatch({ type: "DECREMENT" });
  const reset = () => dispatch({ type: "RESET" });

  return { count: state.count, increment, decrement, reset };
}

// Usage with custom reducer
const { count, increment } = useCounter({
  stateReducer: (state, action) => {
    // Limit count to max 10
    const newState = defaultReducer(state, action);
    return { count: Math.min(newState.count, 10) };
  },
});
```

## Slots Pattern

Named children for complex layouts.

```tsx
interface CardProps {
  children: ReactNode;
}

interface SlotProps {
  children: ReactNode;
}

function Card({ children }: CardProps) {
  const slots = {
    header: null as ReactNode,
    body: null as ReactNode,
    footer: null as ReactNode,
  };

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === CardHeader) slots.header = child;
    else if (child.type === CardBody) slots.body = child;
    else if (child.type === CardFooter) slots.footer = child;
  });

  return (
    <div className="rounded-lg border">
      {slots.header && <div className="border-b p-4">{slots.header}</div>}
      {slots.body && <div className="p-4">{slots.body}</div>}
      {slots.footer && <div className="border-t p-4">{slots.footer}</div>}
    </div>
  );
}

function CardHeader({ children }: SlotProps) {
  return <>{children}</>;
}

function CardBody({ children }: SlotProps) {
  return <>{children}</>;
}

function CardFooter({ children }: SlotProps) {
  return <>{children}</>;
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

// Usage (order doesn't matter)
<Card>
  <Card.Footer>Footer content</Card.Footer>
  <Card.Header>Header content</Card.Header>
  <Card.Body>Body content</Card.Body>
</Card>
```

## Props Getter Pattern

Provide props objects for elements.

```tsx
interface UseDropdownReturn {
  isOpen: boolean;
  toggle: () => void;
  getToggleProps: <T extends HTMLElement>(
    props?: React.HTMLAttributes<T>
  ) => React.HTMLAttributes<T>;
  getMenuProps: <T extends HTMLElement>(
    props?: React.HTMLAttributes<T>
  ) => React.HTMLAttributes<T>;
}

function useDropdown(): UseDropdownReturn {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = () => setIsOpen((o) => !o);

  const getToggleProps = <T extends HTMLElement>(
    props: React.HTMLAttributes<T> = {}
  ) => ({
    ...props,
    onClick: (e: React.MouseEvent<T>) => {
      props.onClick?.(e);
      toggle();
    },
    "aria-expanded": isOpen,
    "aria-haspopup": true as const,
  });

  const getMenuProps = <T extends HTMLElement>(
    props: React.HTMLAttributes<T> = {}
  ) => ({
    ...props,
    role: "menu" as const,
    hidden: !isOpen,
  });

  return { isOpen, toggle, getToggleProps, getMenuProps };
}

// Usage
function Dropdown() {
  const { getToggleProps, getMenuProps, isOpen } = useDropdown();

  return (
    <div>
      <button {...getToggleProps()}>Toggle</button>
      <ul {...getMenuProps()}>
        <li role="menuitem">Option 1</li>
        <li role="menuitem">Option 2</li>
      </ul>
    </div>
  );
}
```

## When to Use Each Pattern

| Pattern | Use Case |
|---------|----------|
| Compound Components | Related components with shared state (Tabs, Accordion) |
| Custom Hooks | Reusable logic without UI |
| Render Props | Dynamic rendering based on state |
| HOC | Cross-cutting concerns (auth, logging) |
| Polymorphic | Component that renders as different elements |
| State Reducer | User-customizable state logic |
| Props Getter | Complex accessibility/behavior props |

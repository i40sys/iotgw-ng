---
name: tanstack-router-query
description: This skill provides guidance for TanStack Router (file-based routing) and TanStack Query (data fetching). It should be used when implementing routes, navigation, route parameters, search params, data loaders, queries, mutations, cache invalidation, or optimistic updates.
---

# TanStack Router & Query

This skill provides patterns for building type-safe routing with TanStack Router and managing server state with TanStack Query.

## Purpose

To enable building fully type-safe navigation and data fetching layers in React applications with excellent developer experience.

## When to Use

### TanStack Router
- Setting up file-based routing
- Creating dynamic routes with parameters
- Implementing type-safe navigation
- Managing search parameters
- Configuring route loaders

### TanStack Query
- Fetching and caching server data
- Performing mutations with cache updates
- Implementing optimistic updates
- Invalidating and refetching queries

---

## TanStack Router

### File-Based Routing Structure

```
src/routes/
├── __root.tsx          # Root layout
├── index.tsx           # / (home)
├── about.tsx           # /about
├── posts/
│   ├── index.tsx       # /posts
│   └── $postId.tsx     # /posts/:postId (dynamic)
├── dashboard/
│   ├── _layout.tsx     # Dashboard layout wrapper
│   ├── index.tsx       # /dashboard
│   └── settings.tsx    # /dashboard/settings
```

### Root Route

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div>
      <nav>{/* Navigation */}</nav>
      <main>
        <Outlet />
      </main>
    </div>
  ),
});
```

### Basic File Route

```tsx
// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return <h1>Welcome Home</h1>;
}
```

### Dynamic Route with Loader

```tsx
// src/routes/posts/$postId.tsx
import { createFileRoute } from "@tanstack/react-router";

async function fetchPost(id: string) {
  const response = await fetch(`/api/posts/${id}`);
  if (!response.ok) throw new Error("Post not found");
  return response.json();
}

export const Route = createFileRoute("/posts/$postId")({
  // Data loader runs before component renders
  loader: async ({ params }) => {
    return await fetchPost(params.postId);
  },
  component: PostPage,
});

function PostPage() {
  // Type-safe loader data
  const post = Route.useLoaderData();

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}
```

### Search Parameters

```tsx
// src/routes/posts/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Define search params schema
const postsSearchSchema = z.object({
  page: z.number().default(1),
  sort: z.enum(["date", "title"]).default("date"),
  filter: z.string().optional(),
});

export const Route = createFileRoute("/posts/")({
  validateSearch: postsSearchSchema,
  component: PostsPage,
});

function PostsPage() {
  // Type-safe search params
  const { page, sort, filter } = Route.useSearch();
  const navigate = Route.useNavigate();

  const handlePageChange = (newPage: number) => {
    navigate({
      search: (prev) => ({ ...prev, page: newPage }),
    });
  };

  return (/* ... */);
}
```

### Type-Safe Navigation

```tsx
import { Link, useNavigate } from "@tanstack/react-router";

function Navigation() {
  const navigate = useNavigate();

  return (
    <nav>
      {/* Type-safe Link */}
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>

      {/* Dynamic route with params */}
      <Link
        to="/posts/$postId"
        params={{ postId: "123" }}
      >
        View Post
      </Link>

      {/* With search params */}
      <Link
        to="/posts"
        search={{ page: 1, sort: "date" }}
      >
        Posts
      </Link>

      {/* Programmatic navigation */}
      <button
        onClick={() => navigate({
          to: "/posts/$postId",
          params: { postId: "456" },
        })}
      >
        Go to Post
      </button>
    </nav>
  );
}
```

---

## TanStack Query

### Query Client Setup

```tsx
// src/main.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* App content */}
    </QueryClientProvider>
  );
}
```

### Basic Query

```tsx
import { useQuery } from "@tanstack/react-query";

interface User {
  id: string;
  name: string;
  email: string;
}

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new Error("User not found");
  return response.json();
}

function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => fetchUser(userId),
  });

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
      <button onClick={() => refetch()}>Refresh</button>
    </div>
  );
}
```

### Query with Dependent Data

```tsx
function UserPosts({ userId }: { userId: string }) {
  // First query
  const userQuery = useQuery({
    queryKey: ["user", userId],
    queryFn: () => fetchUser(userId),
  });

  // Dependent query - only runs when user is loaded
  const postsQuery = useQuery({
    queryKey: ["posts", { userId }],
    queryFn: () => fetchUserPosts(userId),
    enabled: !!userQuery.data, // Only fetch when user exists
  });

  return (/* ... */);
}
```

### Mutation with Cache Update

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface CreatePostInput {
  title: string;
  content: string;
}

function CreatePostForm() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: CreatePostInput) =>
      fetch("/api/posts", {
        method: "POST",
        body: JSON.stringify(input),
      }).then(res => res.json()),

    onSuccess: () => {
      // Invalidate and refetch posts list
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const handleSubmit = (data: CreatePostInput) => {
    mutation.mutate(data);
  };

  return (
    <form onSubmit={/* ... */}>
      {mutation.isPending && <span>Saving...</span>}
      {mutation.isError && <span>Error: {mutation.error.message}</span>}
      {/* Form fields */}
    </form>
  );
}
```

### Optimistic Updates

```tsx
function TodoItem({ todo }: { todo: Todo }) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (completed: boolean) =>
      fetch(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),

    // Optimistic update
    onMutate: async (completed) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["todos"] });

      // Snapshot previous value
      const previousTodos = queryClient.getQueryData<Todo[]>(["todos"]);

      // Optimistically update
      queryClient.setQueryData<Todo[]>(["todos"], (old) =>
        old?.map((t) =>
          t.id === todo.id ? { ...t, completed } : t
        )
      );

      // Return context for rollback
      return { previousTodos };
    },

    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(["todos"], context.previousTodos);
      }
    },

    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  return (
    <input
      type="checkbox"
      checked={todo.completed}
      onChange={(e) => toggleMutation.mutate(e.target.checked)}
    />
  );
}
```

### Invalidating Multiple Queries

```tsx
const mutation = useMutation({
  mutationFn: updateUser,
  onSuccess: async () => {
    // Invalidate multiple related queries
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["user"] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
    ]);
  },
});
```

## Best Practices

### Router
1. **Use file-based routing** - Automatic code splitting and type generation
2. **Validate search params with Zod** - Type-safe URL state
3. **Use loaders for data fetching** - Data ready before render
4. **Leverage type-safe navigation** - Catch routing errors at compile time

### Query
1. **Use meaningful query keys** - Include all variables that affect the query
2. **Set appropriate staleTime** - Reduce unnecessary refetches
3. **Invalidate on mutations** - Keep cache in sync
4. **Handle all states** - Loading, error, and success
5. **Use optimistic updates sparingly** - Only for clear user feedback needs

## Integration with Context7

To fetch latest documentation, use:
- TanStack Router: `/tanstack/router` or `/websites/tanstack_router`
- TanStack Query: `/websites/tanstack_query` or `/tanstack/query`

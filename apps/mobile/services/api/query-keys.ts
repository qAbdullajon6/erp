/// The ONE query-key factory, same discipline as apps/web/src/lib/api/query-keys.ts:
/// nothing writes a raw string key like `['my-dispatches', id]` inline, because two
/// callers spelling the same key slightly differently produce two independent caches.

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export const driverKeys = {
  profile: ['driver', 'profile'] as const,
};

export const myDispatchKeys = {
  all: ['my-dispatches'] as const,
  lists: () => [...myDispatchKeys.all, 'list'] as const,
  detail: (id: string) => [...myDispatchKeys.all, 'detail', id] as const,
};

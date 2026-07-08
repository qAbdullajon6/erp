import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/dispatch/layout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/app/dispatch/layout"!</div>
}

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/notifications/layout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/app/notifications/layout"!</div>
}

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/my-deliveries/layout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/app/my-deliveries/layout"!</div>
}

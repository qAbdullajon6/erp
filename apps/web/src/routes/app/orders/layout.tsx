import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/orders/layout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/app/orders/layout"!</div>
}

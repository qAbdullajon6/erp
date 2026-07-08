import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/drivers/layout')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/app/drivers/layout"!</div>
}

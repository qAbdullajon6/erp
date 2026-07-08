import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/settings/page')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/app/settings/page"!</div>
}

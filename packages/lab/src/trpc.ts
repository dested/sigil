import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { inferRouterOutputs } from '@trpc/server'
import { createTRPCContext } from '@trpc/tanstack-react-query'
import type { AppRouter } from '../server/router'

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>()

export function makeTrpcClient() {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: '/trpc' })] })
}

type Outputs = inferRouterOutputs<AppRouter>
export type ProjectData = Outputs['project']['get']
export type StyleData = NonNullable<ProjectData['style']>
export type IconRowData = ProjectData['icons'][number]
export type FindingData = IconRowData['findings'][number]
export type JobData = Outputs['jobs']['list'][number]
export type JobDetailData = Outputs['jobs']['get']
export type TaskData = Outputs['tasks']['list'][number]
export type DirectionData = Outputs['directions']['list'][number]
export type FeedData = Outputs['debug']['feed']
export type FeedLineData = FeedData['lines'][number]

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

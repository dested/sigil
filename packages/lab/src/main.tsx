import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { makeTrpcClient, TRPCProvider } from './trpc'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})
const trpcClient = makeTrpcClient()

const el = document.getElementById('root')
if (el === null) throw new Error('#root missing from index.html')

createRoot(el).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <App />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
)

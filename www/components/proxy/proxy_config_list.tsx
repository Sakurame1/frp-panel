import { ProxyConfig } from '@/lib/pb/common'
import { ProxyConfigTableSchema, columns as proxyConfigColumnsDef } from './proxy_config_item'
import { DataTable } from '../base/data_table'

import {
  getSortedRowModel,
  getCoreRowModel,
  ColumnFiltersState,
  useReactTable,
  getFilteredRowModel,
  getPaginationRowModel,
  SortingState,
  PaginationState,
} from '@tanstack/react-table'

import React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listProxyConfig } from '@/api/proxy'
import { TypedProxyConfig } from '@/types/proxy'
import { $proxyTableRefetchTrigger } from '@/store/refetch-trigger'
import { useStore } from '@nanostores/react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export interface ProxyConfigListProps {
  ProxyConfigs: ProxyConfig[]
  Keyword?: string
  ClientID?: string
  ServerID?: string
  TriggerRefetch?: string
}

function parseProxyConfig(cfg?: string): TypedProxyConfig | undefined {
  if (!cfg) return undefined
  try {
    return JSON.parse(cfg)
  } catch {
    return undefined
  }
}

function getRemotePort(config?: TypedProxyConfig): number | undefined {
  return config && 'remotePort' in config ? config.remotePort : undefined
}

function toTableRow(proxyConfig: ProxyConfig): ProxyConfigTableSchema {
  const parsed = parseProxyConfig(proxyConfig.config)
  return {
    id: proxyConfig.id || '',
    clientID: proxyConfig.clientId || '',
    serverID: proxyConfig.serverId || '',
    name: proxyConfig.name || '',
    type: (proxyConfig.type || '') as ProxyConfigTableSchema['type'],
    status: (proxyConfig.stopped ? 'stopped' : 'running') as ProxyConfigTableSchema['status'],
    config: proxyConfig.config || '',
    localIP: parsed?.localIP,
    localPort: parsed?.localPort,
    remotePort: getRemotePort(parsed),
    visitPreview: '',
    originalProxyConfig: proxyConfig,
    stopped: proxyConfig.stopped || false,
  }
}

export const ProxyConfigList: React.FC<ProxyConfigListProps> = ({
  ProxyConfigs,
  Keyword,
  TriggerRefetch,
  ClientID,
  ServerID,
}) => {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [typeFilter, setTypeFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'running' | 'stopped'>('all')
  const [minPort, setMinPort] = React.useState('')
  const [maxPort, setMaxPort] = React.useState('')
  const globalRefetchTrigger = useStore($proxyTableRefetchTrigger)

  const [{ pageIndex, pageSize }, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const fetchDataOptions = {
    pageIndex,
    pageSize,
    Keyword,
    TriggerRefetch,
    ClientID,
    ServerID,
    globalRefetchTrigger,
  }
  const pagination = React.useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize],
  )

  const dataQuery = useQuery({
    queryKey: ['listProxyConfigs', fetchDataOptions],
    queryFn: async () => {
      return await listProxyConfig({
        page: fetchDataOptions.pageIndex + 1,
        pageSize: fetchDataOptions.pageSize,
        keyword: fetchDataOptions.Keyword,
        clientId: fetchDataOptions.ClientID,
        serverId: fetchDataOptions.ServerID,
      })
    },
    placeholderData: keepPreviousData,
  })

  const rows = React.useMemo(() => {
    const min = Number(minPort)
    const max = Number(maxPort)
    return (dataQuery.data?.proxyConfigs ?? ProxyConfigs)
      .map(toTableRow)
      .filter((row) => typeFilter === 'all' || row.type === typeFilter)
      .filter((row) => statusFilter === 'all' || row.status === statusFilter)
      .filter((row) => minPort === '' || ((row.remotePort ?? row.localPort ?? 0) >= min))
      .filter((row) => maxPort === '' || ((row.remotePort ?? row.localPort ?? Number.MAX_SAFE_INTEGER) <= max))
  }, [dataQuery.data, ProxyConfigs, typeFilter, statusFilter, minPort, maxPort])

  const table = useReactTable({
    data: rows,
    pageCount: Math.ceil(((dataQuery.data?.total ?? 0) / fetchDataOptions.pageSize) ?? 0),
    columns: proxyConfigColumnsDef,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    state: {
      sorting,
      pagination,
      columnFilters,
    },
  })

  const proxyTypes = ['tcp', 'udp', 'http', 'https', 'tcpmux', 'stcp', 'xtcp', 'sudp']

  return (
    <DataTable
      table={table}
      columns={proxyConfigColumnsDef}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">全部协议</option>
            {proxyTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">全部状态</option>
            <option value="running">运行中</option>
            <option value="stopped">已暂停</option>
          </select>
          <Input className="h-9 w-28" inputMode="numeric" placeholder="最小端口" value={minPort} onChange={(e) => setMinPort(e.target.value)} />
          <Input className="h-9 w-28" inputMode="numeric" placeholder="最大端口" value={maxPort} onChange={(e) => setMaxPort(e.target.value)} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTypeFilter('all')
              setStatusFilter('all')
              setMinPort('')
              setMaxPort('')
              setSorting([])
            }}
          >
            重置
          </Button>
        </div>
      }
    />
  )
}

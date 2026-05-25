import { Server } from '@/lib/pb/common'
import { ServerTableSchema, columns as serverColumnsDef } from './server_item'
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
  VisibilityState,
} from '@tanstack/react-table'

import React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { listServer } from '@/api/server'
import { $serverTableRefetchTrigger } from '@/store/refetch-trigger'
import { useStore } from '@nanostores/react'
import { getClientsStatus } from '@/api/platform'
import { ClientType } from '@/lib/pb/common'
import { ClientStatus_Status } from '@/lib/pb/api_master'
import { Button } from '../ui/button'

const ALL_ROWS_PAGE_SIZE = 10000

export interface ServerListProps {
  Servers: Server[]
  Keyword?: string
  TriggerRefetch?: string
}

export const ServerList: React.FC<ServerListProps> = ({ Servers, Keyword, TriggerRefetch }) => {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [configFilter, setConfigFilter] = React.useState<'all' | 'valid' | 'invalid'>('all')
  const [runtimeFilter, setRuntimeFilter] = React.useState<'all' | 'online' | 'offline' | 'paused'>('all')
  const [columnVisibility] = React.useState<VisibilityState>({
    runtimeStatus: false,
    ping: false,
  })
  const globalRefetchTrigger = useStore($serverTableRefetchTrigger)

  const data = Servers.map(
    (server) =>
      ({
        id: server.id == undefined ? '' : server.id,
        status: server.config == undefined || server.config == '' ? 'invalid' : 'valid',
        runtimeStatus: 'unknown',
        ping: Number.MAX_SAFE_INTEGER,
        secret: server.secret == undefined ? '' : server.secret,
        config: server.config,
        stopped: false,
        ip: server.ip || '',
        frpsUrls: server.frpsUrls || [],
      }) as ServerTableSchema,
  )

  const [{ pageIndex, pageSize }, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const fetchDataOptions = {
    Keyword,
    TriggerRefetch,
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
    queryKey: ['listServerAll', fetchDataOptions],
    queryFn: async () => {
      return await listServer({ page: 1, pageSize: ALL_ROWS_PAGE_SIZE, keyword: fetchDataOptions.Keyword })
    },
    placeholderData: keepPreviousData,
  })

  const allServers = dataQuery.data?.servers ?? Servers
  const serverIds = React.useMemo(() => allServers.map((server) => server.id || '').filter(Boolean), [allServers])
  const statusQuery = useQuery({
    queryKey: ['listServerStatuses', serverIds.join(','), globalRefetchTrigger],
    queryFn: async () => {
      if (serverIds.length === 0) {
        return undefined
      }
      return await getClientsStatus({ clientIds: serverIds, clientType: ClientType.FRPS })
    },
    enabled: serverIds.length > 0,
    refetchInterval: 10000,
  })

  const rows = React.useMemo(() => {
    return allServers
      .map((server) => {
        const id = server.id || ''
        const status = statusQuery.data?.clients[id]
        const runtimeStatus: ServerTableSchema['runtimeStatus'] =
          status?.status === ClientStatus_Status.ONLINE
              ? 'online'
              : status?.status === ClientStatus_Status.ERROR
                ? 'error'
                : status?.status === ClientStatus_Status.OFFLINE
                  ? 'offline'
                  : 'unknown'
        const version = status?.version
        return {
          id,
          status: server.config == undefined || server.config == '' ? 'invalid' : 'valid',
          runtimeStatus,
          ping: status?.ping ?? Number.MAX_SAFE_INTEGER,
          info: `${runtimeStatus} ${status?.ping ?? ''} ${version?.gitVersion ?? ''} ${version?.platform ?? ''} ${version?.goVersion ?? ''}`,
          clientStatus: status,
          secret: server.secret == undefined ? '' : server.secret,
          ip: server.ip || '',
          config: server.config,
          stopped: false,
          frpsUrls: server.frpsUrls || [],
        } as ServerTableSchema
      })
      .filter((row) => configFilter === 'all' || row.status === configFilter)
      .filter((row) => runtimeFilter === 'all' || row.runtimeStatus === runtimeFilter)
  }, [allServers, statusQuery.data, configFilter, runtimeFilter])

  React.useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [Keyword, configFilter, runtimeFilter])

  const table = useReactTable({
    data: rows.length > 0 || dataQuery.data ? rows : data,
    columns: serverColumnsDef,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: (updater) => {
      setSorting(updater)
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility,
    },
  })
  return (
    <DataTable
      table={table}
      columns={serverColumnsDef}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={configFilter} onChange={(e) => setConfigFilter(e.target.value as any)}>
            <option value="all">全部配置</option>
            <option value="valid">已配置</option>
            <option value="invalid">未配置</option>
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={runtimeFilter} onChange={(e) => setRuntimeFilter(e.target.value as any)}>
            <option value="all">全部在线状态</option>
            <option value="online">在线</option>
            <option value="offline">离线</option>
            <option value="paused">已暂停</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => {
            setConfigFilter('all')
            setRuntimeFilter('all')
            setSorting([])
          }}>
            重置
          </Button>
        </div>
      }
    />
  )
}

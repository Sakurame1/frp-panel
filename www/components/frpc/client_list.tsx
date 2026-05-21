import { Client } from '@/lib/pb/common'
import { ClientTableSchema, columns as clientColumnsDef } from './client_item'
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
import { listClient } from '@/api/client'
import { ClientConfigured } from '@/lib/consts'
import { useStore } from '@nanostores/react'
import { $clientTableRefetchTrigger } from '@/store/refetch-trigger'
import { getClientsStatus } from '@/api/platform'
import { ClientType } from '@/lib/pb/common'
import { ClientStatus_Status } from '@/lib/pb/api_master'
import { Button } from '../ui/button'

export interface ClientListProps {
  Clients: Client[]
  Keyword?: string
  TriggerRefetch?: string
}

export const ClientList: React.FC<ClientListProps> = ({ Clients, Keyword, TriggerRefetch }) => {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [configFilter, setConfigFilter] = React.useState<'all' | 'valid' | 'invalid'>('all')
  const [runtimeFilter, setRuntimeFilter] = React.useState<'all' | 'online' | 'offline' | 'paused'>('all')
  const [nodeFilter, setNodeFilter] = React.useState<'all' | 'persistent' | 'ephemeral'>('all')
  const [columnVisibility] = React.useState<VisibilityState>({
    runtimeStatus: false,
    ping: false,
    ephemeral: false,
  })
  const globalRefetchTrigger = useStore($clientTableRefetchTrigger)

  const data = Clients.map(
    (client) =>
      ({
        id: client.id == undefined ? '' : client.id,
        status: ClientConfigured(client) ? 'valid' : 'invalid',
        runtimeStatus: 'unknown',
        ping: Number.MAX_SAFE_INTEGER,
        secret: client.secret == undefined ? '' : client.secret,
        config: client.config,
        stopped: client.stopped || false,
        ephemeral: client.ephemeral || false,
        originClient: client,
        clientIds: client.clientIds || [],
      }) as ClientTableSchema,
  )

  const [{ pageIndex, pageSize }, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const fetchDataOptions = {
    pageIndex,
    pageSize,
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
    queryKey: ['listClient', fetchDataOptions],
    queryFn: async () => {
      return await listClient({ page: fetchDataOptions.pageIndex + 1, pageSize: fetchDataOptions.pageSize, keyword: fetchDataOptions.Keyword })
    },
    placeholderData: keepPreviousData,
  })

  const pageClients = dataQuery.data?.clients ?? Clients
  const clientIds = React.useMemo(() => pageClients.map((client) => client.id || '').filter(Boolean), [pageClients])
  const statusQuery = useQuery({
    queryKey: ['listClientStatuses', clientIds.join(','), globalRefetchTrigger],
    queryFn: async () => {
      if (clientIds.length === 0) {
        return undefined
      }
      return await getClientsStatus({ clientIds, clientType: ClientType.FRPC })
    },
    enabled: clientIds.length > 0,
    refetchInterval: 10000,
  })

  const rows = React.useMemo(() => {
    return pageClients
      .map((client) => {
        const id = client.id || ''
        const status = statusQuery.data?.clients[id]
        const runtimeStatus: ClientTableSchema['runtimeStatus'] =
          client.stopped
            ? 'paused'
            : status?.status === ClientStatus_Status.ONLINE
              ? 'online'
              : status?.status === ClientStatus_Status.ERROR
                ? 'error'
                : status?.status === ClientStatus_Status.OFFLINE
                  ? 'offline'
                  : 'unknown'
        const version = status?.version
        return {
          id,
          status: ClientConfigured(client) ? 'valid' : 'invalid',
          runtimeStatus,
          ping: status?.ping ?? Number.MAX_SAFE_INTEGER,
          info: `${runtimeStatus} ${status?.ping ?? ''} ${version?.gitVersion ?? ''} ${version?.platform ?? ''} ${version?.goVersion ?? ''}`,
          clientStatus: status,
          secret: client.secret == undefined ? '' : client.secret,
          config: client.config,
          stopped: client.stopped || false,
          ephemeral: client.ephemeral || false,
          originClient: client,
          clientIds: client.clientIds || [],
        } as ClientTableSchema
      })
      .filter((row) => configFilter === 'all' || row.status === configFilter)
      .filter((row) => runtimeFilter === 'all' || row.runtimeStatus === runtimeFilter)
      .filter((row) => nodeFilter === 'all' || (nodeFilter === 'ephemeral' ? row.ephemeral : !row.ephemeral))
  }, [pageClients, statusQuery.data, configFilter, runtimeFilter, nodeFilter])

  React.useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [Keyword, configFilter, runtimeFilter, nodeFilter])

  const table = useReactTable({
    data: rows.length > 0 || dataQuery.data ? rows : data,
    pageCount: Math.ceil(
      // @ts-ignore
      (dataQuery.data?.total == undefined ? 0 : dataQuery.data?.total) / fetchDataOptions.pageSize ?? 0,
    ),
    columns: clientColumnsDef,
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
      columnVisibility,
    },
  })
  return (
    <DataTable
      table={table}
      columns={clientColumnsDef}
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
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value as any)}>
            <option value="all">全部节点</option>
            <option value="persistent">常驻节点</option>
            <option value="ephemeral">临时节点</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => {
            setConfigFilter('all')
            setRuntimeFilter('all')
            setNodeFilter('all')
            setSorting([])
          }}>
            重置
          </Button>
        </div>
      }
    />
  )
}

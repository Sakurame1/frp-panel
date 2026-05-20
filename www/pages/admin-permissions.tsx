import { Providers } from '@/components/providers'
import { RootLayout } from '@/components/layout'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  createInvite,
  getRegisterSetting,
  grantPermission,
  listInvites,
  listUsers,
  revokePermission,
  updateInvite,
  updateRegisterSetting,
  updateUser,
  type AdminUser,
  type InviteCode,
} from '@/api/permission'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

const STATUS_NORMAL = 1
const STATUS_BANNED = 2

type PermissionDraft = {
  objType: string
  objID: string
  permission: 'view' | 'edit'
}

const defaultPermissionDraft: PermissionDraft = {
  objType: 'client',
  objID: '',
  permission: 'view',
}

function AdminPermissionPanel() {
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [registerEnabled, setRegisterEnabled] = useState(false)
  const [inviteRequired, setInviteRequired] = useState(true)
  const [maxUses, setMaxUses] = useState(1)
  const [days, setDays] = useState(7)
  const [comment, setComment] = useState('')
  const [keyword, setKeyword] = useState('')
  const [drafts, setDrafts] = useState<Record<number, PermissionDraft>>({})

  const reloadRegistration = async () => {
    const [setting, inviteList] = await Promise.all([getRegisterSetting(), listInvites()])
    setRegisterEnabled(setting.register_enabled)
    setInviteRequired(setting.invite_required)
    setInvites(inviteList)
  }

  const reloadUsers = async () => {
    setUsers(await listUsers())
  }

  useEffect(() => {
    Promise.all([reloadRegistration(), reloadUsers()]).catch((e) => toast.error(getErrorMessage(e)))
  }, [])

  const filteredUsers = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return users
    return users.filter((user) => user.user_name?.toLowerCase().includes(q) || user.email?.toLowerCase().includes(q) || String(user.user_id).includes(q))
  }, [keyword, users])

  const submitInvite = async () => {
    const expiresAt = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : undefined
    await createInvite({ max_uses: maxUses, expires_at: expiresAt, comment })
    setComment('')
    await reloadRegistration()
    toast.success('邀请码已创建')
  }

  const toggleRegisterEnabled = async (checked: boolean) => {
    setRegisterEnabled(checked)
    const next = await updateRegisterSetting({ register_enabled: checked })
    setRegisterEnabled(next.register_enabled)
    setInviteRequired(next.invite_required)
    toast.success('注册设置已更新')
  }

  const toggleInviteRequired = async (checked: boolean) => {
    setInviteRequired(checked)
    const next = await updateRegisterSetting({ invite_required: checked })
    setRegisterEnabled(next.register_enabled)
    setInviteRequired(next.invite_required)
    toast.success('注册设置已更新')
  }

  const toggleInvite = async (invite: InviteCode) => {
    await updateInvite({ id: invite.id, disabled: !invite.disabled })
    await reloadRegistration()
  }

  const patchUser = async (user: AdminUser, patch: Partial<AdminUser>) => {
    await updateUser({ user_id: user.user_id, ...patch })
    await reloadUsers()
    toast.success('用户已更新')
  }

  const updateDraft = (userID: number, patch: Partial<PermissionDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [userID]: {
        ...defaultPermissionDraft,
        ...prev[userID],
        ...patch,
      },
    }))
  }

  const submitPermission = async (user: AdminUser, mode: 'grant' | 'revoke') => {
    const draft = drafts[user.user_id] ?? defaultPermissionDraft
    if (!draft.objID.trim()) {
      toast.error('请输入资源 ID')
      return
    }
    const payload = {
      obj_type: draft.objType,
      obj_id: draft.objID.trim(),
      target_type: 'user' as const,
      target_id: String(user.user_id),
      permission: draft.permission,
    }
    if (mode === 'grant') {
      await grantPermission(payload)
      toast.success('权限已分配')
    } else {
      await revokePermission(payload)
      toast.success('权限已撤销')
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl py-4">
      <Tabs defaultValue="registration" className="space-y-4">
        <TabsList>
          <TabsTrigger value="registration">注册相关</TabsTrigger>
          <TabsTrigger value="users">用户列表</TabsTrigger>
        </TabsList>

        <TabsContent value="registration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>注册设置</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SettingRow title="允许新用户注册" description="关闭后，除首个管理员外，任何邀请码都不能注册新账号。">
                <Switch checked={registerEnabled} onCheckedChange={toggleRegisterEnabled} />
              </SettingRow>
              <SettingRow title="注册必须使用邀请码" description="关闭后，开放注册不再校验邀请码。">
                <Switch checked={inviteRequired} onCheckedChange={toggleInviteRequired} disabled={!registerEnabled} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>邀请码设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[160px_160px_1fr_auto]">
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} placeholder="激活次数" />
                <Input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} placeholder="有效天数" />
                <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="备注" />
                <Button onClick={submitInvite}>新增邀请码</Button>
              </div>
              <InviteTable invites={invites} onToggle={toggleInvite} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>用户列表</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="max-w-xs" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索用户、邮箱或 ID" />
                <Button variant="outline" onClick={() => reloadUsers()}>
                  刷新
                </Button>
              </div>
              <UserTable users={filteredUsers} drafts={drafts} onPatchUser={patchUser} onUpdateDraft={updateDraft} onPermission={submitPermission} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  )
}

function InviteTable({ invites, onToggle }: { invites: InviteCode[]; onToggle: (invite: InviteCode) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>邀请码</TableHead>
          <TableHead>使用次数</TableHead>
          <TableHead>有效期</TableHead>
          <TableHead>状态</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invites.map((invite) => (
          <TableRow key={invite.id}>
            <TableCell className="font-mono">{invite.code}</TableCell>
            <TableCell>
              {invite.used_count}/{invite.max_uses}
            </TableCell>
            <TableCell>{invite.expires_at ? new Date(invite.expires_at).toLocaleString() : '长期'}</TableCell>
            <TableCell>{invite.disabled ? '禁用' : '启用'}</TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" onClick={() => onToggle(invite)}>
                {invite.disabled ? '启用' : '禁用'}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function UserTable({
  users,
  drafts,
  onPatchUser,
  onUpdateDraft,
  onPermission,
}: {
  users: AdminUser[]
  drafts: Record<number, PermissionDraft>
  onPatchUser: (user: AdminUser, patch: Partial<AdminUser>) => void
  onUpdateDraft: (userID: number, patch: Partial<PermissionDraft>) => void
  onPermission: (user: AdminUser, mode: 'grant' | 'revoke') => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">ID</TableHead>
          <TableHead>用户信息</TableHead>
          <TableHead>角色</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>单用户权限</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const draft = drafts[user.user_id] ?? defaultPermissionDraft
          return (
            <TableRow key={user.user_id}>
              <TableCell>{user.user_id}</TableCell>
              <TableCell>
                <div className="grid gap-2">
                  <Input defaultValue={user.user_name ?? ''} onBlur={(e) => e.target.value !== user.user_name && onPatchUser(user, { user_name: e.target.value })} />
                  <Input defaultValue={user.email ?? ''} onBlur={(e) => e.target.value !== user.email && onPatchUser(user, { email: e.target.value })} />
                </div>
              </TableCell>
              <TableCell>
                <select className="h-9 rounded-md border bg-background px-3 text-sm" value={user.role || 'normal'} onChange={(e) => onPatchUser(user, { role: e.target.value })}>
                  <option value="normal">标准用户</option>
                  <option value="admin">管理员</option>
                </select>
              </TableCell>
              <TableCell>
                <Button variant={user.status === STATUS_BANNED ? 'destructive' : 'outline'} size="sm" onClick={() => onPatchUser(user, { status: user.status === STATUS_BANNED ? STATUS_NORMAL : STATUS_BANNED })}>
                  {user.status === STATUS_BANNED ? '解除封禁' : '封禁'}
                </Button>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="h-9 rounded-md border bg-background px-3 text-sm" value={draft.objType} onChange={(e) => onUpdateDraft(user.user_id, { objType: e.target.value })}>
                    <option value="client">客户端</option>
                    <option value="server">服务端</option>
                    <option value="worker">Worker</option>
                  </select>
                  <Input className="w-40" value={draft.objID} onChange={(e) => onUpdateDraft(user.user_id, { objID: e.target.value })} placeholder="资源 ID" />
                  <select className="h-9 rounded-md border bg-background px-3 text-sm" value={draft.permission} onChange={(e) => onUpdateDraft(user.user_id, { permission: e.target.value as PermissionDraft['permission'] })}>
                    <option value="view">仅查看</option>
                    <option value="edit">编辑</option>
                  </select>
                  <Button size="sm" onClick={() => onPermission(user, 'grant')}>
                    授权
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onPermission(user, 'revoke')}>
                    撤销
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return '操作失败'
}

export default function AdminPermissionsPage() {
  return (
    <Providers>
      <RootLayout mainHeader={<Header />}>
        <AdminPermissionPanel />
      </RootLayout>
    </Providers>
  )
}

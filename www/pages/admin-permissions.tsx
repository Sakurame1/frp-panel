import { Providers } from '@/components/providers'
import { RootLayout } from '@/components/layout'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createInvite, getRegisterSetting, listInvites, updateInvite, updateRegisterSetting, type InviteCode } from '@/api/permission'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

function AdminPermissionPanel() {
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [inviteRequired, setInviteRequired] = useState(true)
  const [maxUses, setMaxUses] = useState(1)
  const [days, setDays] = useState(7)
  const [comment, setComment] = useState('')

  const reload = async () => {
    const [setting, inviteList] = await Promise.all([getRegisterSetting(), listInvites()])
    setInviteRequired(setting.invite_required)
    setInvites(inviteList)
  }

  useEffect(() => {
    reload().catch((e) => toast.error((e as Error).message))
  }, [])

  const submitInvite = async () => {
    const expiresAt = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : undefined
    await createInvite({ max_uses: maxUses, expires_at: expiresAt, comment })
    setComment('')
    await reload()
    toast.success('邀请码已创建')
  }

  const toggleInviteRequired = async (checked: boolean) => {
    setInviteRequired(checked)
    await updateRegisterSetting(checked)
    toast.success('注册设置已更新')
  }

  const toggleInvite = async (invite: InviteCode) => {
    await updateInvite({ id: invite.id, disabled: !invite.disabled })
    await reload()
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>注册与邀请码</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">注册必须使用邀请码</div>
              <div className="text-xs text-muted-foreground">关闭后，开放注册不再校验邀请码。</div>
            </div>
            <Switch checked={inviteRequired} onCheckedChange={toggleInviteRequired} />
          </div>
          <div className="grid gap-3 md:grid-cols-[160px_160px_1fr_auto]">
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} placeholder="激活次数" />
            <Input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} placeholder="有效天数" />
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="备注" />
            <Button onClick={submitInvite}>新增邀请码</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>邀请码列表</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <TableCell>{invite.used_count}/{invite.max_uses}</TableCell>
                  <TableCell>{invite.expires_at ? new Date(invite.expires_at).toLocaleString() : '长期'}</TableCell>
                  <TableCell>{invite.disabled ? '禁用' : '启用'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => toggleInvite(invite)}>
                      {invite.disabled ? '启用' : '禁用'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
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

import http from '@/api/http'
import { API_PATH } from '@/lib/consts'
import { BaseResponse } from '@/types/api'

const unwrap = (res: any) => (res.data as BaseResponse).body ?? (res.data as any).data

export interface InviteCode {
  id: number
  code: string
  tenant_id: number
  created_by: number
  max_uses: number
  used_count: number
  expires_at?: string
  disabled: boolean
  comment?: string
}

export const listInvites = async (): Promise<InviteCode[]> => {
  const res = await http.post(API_PATH + '/permission/invite/list', {})
  return unwrap(res) ?? []
}

export const createInvite = async (req: { code?: string; max_uses: number; expires_at?: number; comment?: string }) => {
  const res = await http.post(API_PATH + '/permission/invite/create', req)
  return unwrap(res)
}

export const updateInvite = async (req: { id: number; disabled: boolean }) => {
  const res = await http.post(API_PATH + '/permission/invite/update', req)
  return unwrap(res)
}

export const getRegisterSetting = async (): Promise<{ invite_required: boolean }> => {
  const res = await http.post(API_PATH + '/permission/register-setting/get', {})
  return unwrap(res) ?? { invite_required: true }
}

export const updateRegisterSetting = async (inviteRequired: boolean) => {
  const res = await http.post(API_PATH + '/permission/register-setting/update', { invite_required: inviteRequired })
  return unwrap(res)
}

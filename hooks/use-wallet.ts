'use client'

import { useEffect, useState, useCallback } from 'react'
import { MiniKit } from '@worldcoin/minikit-js'

export interface WalletState {
  address: string | null
  isInstalled: boolean
  isConnecting: boolean
  isOwner1: boolean
  isOwner2: boolean
  isAnyOwner: boolean
}

const OWNER2 = '0xc2ef127734f296952de75c1b58a6cec605cc2e59'

export function useWallet(owner1: string | null, knownOwners: string[], isInstalled: boolean) {
  const [state, setState] = useState<WalletState>({
    address: null,
    isInstalled: false,
    isConnecting: false,
    isOwner1: false,
    isOwner2: false,
    isAnyOwner: false,
  })

  function computeRoles(addr: string | null) {
    if (!addr) return { isOwner1: false, isOwner2: false, isAnyOwner: false }
    const low = addr.toLowerCase()
    const isOwner1 = owner1 ? low === owner1.toLowerCase() : false
    const isOwner2 = low === OWNER2.toLowerCase()
    const isAnyOwner = isOwner1 || isOwner2 || knownOwners.some(o => o.toLowerCase() === low)
    return { isOwner1, isOwner2, isAnyOwner }
  }

  useEffect(() => {
    if (!isInstalled) return
    const addr = MiniKit.walletAddress
    if (addr) {
      const roles = computeRoles(addr)
      setState({ address: addr, isInstalled: true, isConnecting: false, ...roles })
    } else {
      setState(s => ({ ...s, isInstalled: true }))
    }
  }, [isInstalled, owner1]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state.address) return
    const roles = computeRoles(state.address)
    setState(s => ({ ...s, ...roles }))
  }, [owner1, knownOwners.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(async () => {
    const installed = MiniKit.isInstalled()
    if (!installed) {
      console.warn('[usg-wallet] MiniKit not installed — not inside World App')
      return
    }
    setState(s => ({ ...s, isConnecting: true }))
    try {
      const nonce = crypto.randomUUID()
      const result = await MiniKit.commandsAsync.walletAuth({
        nonce,
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
        statement: 'Conectar a Unity Stake Global (USG)',
      })

      const { finalPayload } = result
      console.log('[usg-wallet] auth result status=%s', finalPayload?.status)

      if (finalPayload?.status === 'success') {
        const payloadAddr = (finalPayload as any).address ?? null
        const addr: string | null = payloadAddr ?? MiniKit.walletAddress ?? null
        const roles = computeRoles(addr)
        setState({ address: addr, isInstalled: true, isConnecting: false, ...roles })
      } else {
        console.warn('[usg-wallet] auth not successful status=%s', finalPayload?.status)
        setState(s => ({ ...s, isConnecting: false }))
      }
    } catch (err) {
      console.error('[usg-wallet] connect error', err)
      setState(s => ({ ...s, isConnecting: false }))
    }
  }, [owner1, knownOwners.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, connect }
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MiniKit } from '@worldcoin/minikit-js'
import {
  Globe2, Wallet, Loader2, RefreshCw, TrendingUp, Users, Coins,
  ArrowDownToLine, ArrowUpFromLine, Gift, Shield, Plus, Minus,
  AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, ChevronDown,
  ChevronUp, Star, BarChart3, History, PiggyBank, Settings, Lock,
  DollarSign, Zap, Trophy, UserCheck, Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWallet } from '@/hooks/use-wallet'
import {
  STAKING_CONTRACT, USG_TOKEN, PERMIT2_ADDRESS, OWNER2_ADDRESS, BUY_LINK,
  STAKING_ABI, ERC20_ABI,
  fetchPoolStats, fetchUserInfo, fetchOwnerDetails, fetchOwners, fetchUSGBalance, fetchOwner1,
  formatToken, formatAPR, bpsToPercent, shortenAddress, formatDate,
  PoolStats, UserInfo, TxRecord,
} from '@/lib/contract'
import { ethers } from 'ethers'
import { cn } from '@/lib/utils'

// ─── Constants ──────────────────────────────────────────────────────────────
const WORLD_CHAIN_RPC = 'https://worldchain-mainnet.g.alchemy.com/public'
const TX_STORAGE_KEY = 'usg_tx_history'
const OWNER_NAMES_KEY = 'usg_owner_names'

// ─── Utility: nonce aleatorio para Permit2 ──────────────────────────────────
function randomNonce(): bigint {
  const a = new Uint32Array(2)
  crypto.getRandomValues(a)
  return BigInt(a[0]) * 65536n + BigInt(a[1] & 0xffff)
}

// ─── Utility: guardar/leer historial en localStorage ────────────────────────
function saveTx(tx: TxRecord) {
  try {
    const raw = localStorage.getItem(TX_STORAGE_KEY)
    const list: TxRecord[] = raw ? JSON.parse(raw) : []
    list.unshift(tx)
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(list.slice(0, 200)))
  } catch {}
}
function loadTxHistory(): TxRecord[] {
  try {
    const raw = localStorage.getItem(TX_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function loadOwnerNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OWNER_NAMES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
function saveOwnerNames(names: Record<string, string>) {
  try {
    localStorage.setItem(OWNER_NAMES_KEY, JSON.stringify(names))
  } catch {}
}

// ─── Toast simple ───────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info'
interface Toast { id: number; msg: string; type: ToastType }

// ─── Loading screen ─────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: 'linear-gradient(135deg,#0a0f1e 0%,#0d1a2e 50%,#0a1628 100%)' }}>
      <img src="/bg-usg.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full border-4 border-yellow-500/40 animate-pulse flex items-center justify-center overflow-hidden">
          <img src="/bg-usg.jpg" alt="USG" className="w-full h-full object-cover" />
        </div>
        <p className="text-yellow-400 font-bold text-lg">Unity Stake Global</p>
        <Loader2 className="w-6 h-6 text-yellow-500 animate-spin" />
        <p className="text-slate-400 text-sm">Iniciando...</p>
      </div>
    </div>
  )
}

// ─── Not Installed (fuera de World App) ─────────────────────────────────────
function NotInstalled() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 text-center"
      style={{ background: 'linear-gradient(135deg,#0a0f1e 0%,#0d1a2e 50%,#0a1628 100%)' }}>
      <img src="/bg-usg.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-yellow-500/50 shadow-2xl shadow-yellow-500/20">
          <img src="/bg-usg.jpg" alt="USG" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-yellow-400">Unity Stake Global</h1>
          <p className="text-yellow-600 text-sm font-bold mt-1">$USG — World Chain</p>
        </div>
        <p className="text-slate-300 text-sm max-w-xs leading-relaxed">
          Abre esta app dentro de <strong className="text-white">World App</strong> para conectar tu wallet y comenzar a stakear USG.
        </p>
        <a href={BUY_LINK} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-yellow-500 text-black px-5 py-2.5 rounded-full font-bold text-sm hover:bg-yellow-400 transition-colors">
          <ExternalLink className="w-4 h-4" />
          Comprar $USG en Ani Launchpad
        </a>
      </div>
    </div>
  )
}

// ─── Connect Screen ──────────────────────────────────────────────────────────
function ConnectScreen({ onConnect, loading }: { onConnect: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(135deg,#0a0f1e 0%,#0d1a2e 60%,#0a1628 100%)' }}>
      <img src="/bg-usg.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-yellow-500/60 shadow-2xl shadow-yellow-500/30">
          <img src="/bg-usg.jpg" alt="USG" className="w-full h-full object-cover" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-yellow-400 tracking-tight">Unity Stake Global</h1>
          <p className="text-yellow-600 font-bold mt-1">$USG · World Chain</p>
          <p className="text-slate-400 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
            Juntos construimos. Juntos crecemos. Juntos ganamos.
          </p>
        </div>

        <div className="w-full rounded-2xl border border-yellow-500/20 bg-black/40 backdrop-blur-sm p-5 flex flex-col gap-3">
          <StatRow icon={<Zap className="w-3.5 h-3.5 text-yellow-400" />} label="APR Variable" value="Impulsado por pool" />
          <StatRow icon={<Shield className="w-3.5 h-3.5 text-blue-400" />} label="Comisión del sistema" value="5%" />
          <StatRow icon={<PiggyBank className="w-3.5 h-3.5 text-green-400" />} label="Al fondo del stake" value="2.5%" />
          <StatRow icon={<Users className="w-3.5 h-3.5 text-purple-400" />} label="A los Dev Owners" value="2.5%" />
          <StatRow icon={<Globe2 className="w-3.5 h-3.5 text-cyan-400" />} label="Red" value="World Chain (480)" />
        </div>

        <Button
          className="w-full h-12 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-base rounded-xl shadow-lg shadow-yellow-500/25"
          onClick={onConnect}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Wallet className="w-5 h-5 mr-2" />}
          Conectar World Wallet
        </Button>

        <a href={BUY_LINK} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-yellow-500 hover:text-yellow-400 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" />
          Comprar $USG en Ani Launchpad
        </a>
      </div>
    </div>
  )
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-slate-400 flex-1">{label}</span>
      <span className="text-xs font-bold text-white">{value}</span>
    </div>
  )
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-yellow-500/20 bg-black/50 backdrop-blur-sm p-4 mb-4', className)}>
      {children}
    </div>
  )
}

function PanelTitle({ icon, children, right }: { icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg bg-yellow-500/15 flex items-center justify-center">{icon}</div>
      <h2 className="text-sm font-bold text-yellow-400 flex-1">{children}</h2>
      {right}
    </div>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'yellow' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  const colors: Record<string, string> = {
    yellow: 'text-yellow-400', green: 'text-green-400', blue: 'text-blue-400',
    purple: 'text-purple-400', cyan: 'text-cyan-400', red: 'text-red-400', white: 'text-white',
  }
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3 flex flex-col gap-1">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={cn('text-base font-bold leading-tight', colors[color] ?? colors.yellow)}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

// ─── Toast display ────────────────────────────────────────────────────────────
function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 max-w-xs w-full px-4">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          'flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs shadow-xl backdrop-blur-sm border',
          t.type === 'success' && 'bg-green-950/90 border-green-500/40 text-green-300',
          t.type === 'error'   && 'bg-red-950/90 border-red-500/40 text-red-300',
          t.type === 'info'    && 'bg-blue-950/90 border-blue-500/40 text-blue-300',
        )}>
          {t.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          {t.type === 'error'   && <AlertCircle  className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          {t.type === 'info'    && <Activity     className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function UsgApp() {
  // Detection state
  const [isInstalled, setIsInstalled] = useState<null | true | false>(null)

  // Contract data
  const [poolStats, setPoolStats]     = useState<PoolStats | null>(null)
  const [userInfo, setUserInfo]       = useState<UserInfo | null>(null)
  const [usgBalance, setUsgBalance]   = useState(0n)
  const [owners, setOwners]           = useState<string[]>([])
  const [owner1Addr, setOwner1Addr]   = useState<string | null>(null)
  const [ownerDetails, setOwnerDetails] = useState<{ isOwner: boolean; commissionBalance: bigint; totalClaimed: bigint } | null>(null)
  const [ownerNames, setOwnerNames]   = useState<Record<string, string>>({})

  // UI state
  const [loading, setLoading]         = useState(false)
  const [txHistory, setTxHistory]     = useState<TxRecord[]>([])
  const [toasts, setToasts]           = useState<Toast[]>([])
  const toastId = useRef(0)

  // Panel collapse state
  const [showStats, setShowStats]       = useState(true)
  const [showStake, setShowStake]       = useState(true)
  const [showHistory, setShowHistory]   = useState(true)
  const [showFund, setShowFund]         = useState(true)
  const [showOwnerConfig, setShowOwnerConfig] = useState(false)
  const [showAdminSecret, setShowAdminSecret] = useState(false)

  // Stake inputs
  const [stakeAmt, setStakeAmt]     = useState('')
  const [unstakeAmt, setUnstakeAmt] = useState('')
  const [fundAmt, setFundAmt]       = useState('')

  // Admin inputs
  const [newOwnerAddr, setNewOwnerAddr]   = useState('')
  const [removeOwnerAddr, setRemoveOwnerAddr] = useState('')
  const [newCommission, setNewCommission] = useState('')
  const [withdrawAmt, setWithdrawAmt]     = useState('')
  const [withdrawTo, setWithdrawTo]       = useState('')
  const [recoverToken, setRecoverToken]   = useState('')
  const [recoverAmt, setRecoverAmt]       = useState('')
  const [editingName, setEditingName]     = useState('')
  const [editingAddr, setEditingAddr]     = useState<string | null>(null)

  // Wallet
  const wallet = useWallet(owner1Addr, owners, isInstalled === true)

  // ── Toast helper ─────────────────────────────────────────────────────────
  const toast = useCallback((msg: string, type: ToastType = 'info') => {
    const id = ++toastId.current
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])

  // ── Detect MiniKit ───────────────────────────────────────────────────────
  useEffect(() => {
    let attempts = 0
    const iv = setInterval(() => {
      attempts++
      const installed = MiniKit.isInstalled()
      if (installed || attempts >= 20) {
        clearInterval(iv)
        setIsInstalled(installed)
      }
    }, 200)
    return () => clearInterval(iv)
  }, [])

  // ── Load owner names from localStorage ───────────────────────────────────
  useEffect(() => {
    setOwnerNames(loadOwnerNames())
    setTxHistory(loadTxHistory())
  }, [])

  // ── Fetch owner1 address on mount ─────────────────────────────────────────
  useEffect(() => {
    fetchOwner1().then(addr => {
      if (addr) setOwner1Addr(addr)
    })
  }, [])

  // ── Load pool stats ───────────────────────────────────────────────────────
  const loadPoolStats = useCallback(async () => {
    const [stats, ownerList] = await Promise.all([fetchPoolStats(), fetchOwners()])
    if (stats) setPoolStats(stats)
    if (ownerList.length) setOwners(ownerList)
  }, [])

  // ── Load user-specific data ───────────────────────────────────────────────
  const loadUserData = useCallback(async (addr: string) => {
    const [info, bal, ownerDet] = await Promise.all([
      fetchUserInfo(addr),
      fetchUSGBalance(addr),
      fetchOwnerDetails(addr),
    ])
    if (info) setUserInfo(info)
    setUsgBalance(bal)
    if (ownerDet) setOwnerDetails(ownerDet)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await loadPoolStats()
      if (wallet.address) await loadUserData(wallet.address)
    } finally {
      setLoading(false)
    }
  }, [wallet.address, loadPoolStats, loadUserData])

  // Load on mount and when wallet connects
  useEffect(() => { loadPoolStats() }, [loadPoolStats])
  useEffect(() => {
    if (wallet.address) loadUserData(wallet.address)
  }, [wallet.address, loadUserData])

  // ── Provider / contract helpers ──────────────────────────────────────────
  function getProvider() { return new ethers.JsonRpcProvider(WORLD_CHAIN_RPC) }
  function getReadContract() {
    return new ethers.Contract(STAKING_CONTRACT, STAKING_ABI, getProvider())
  }
  function getERC20Read(addr: string) {
    return new ethers.Contract(addr, ERC20_ABI, getProvider())
  }

  function addTx(tx: Omit<TxRecord, 'timestamp'>) {
    const record: TxRecord = { ...tx, timestamp: Date.now() }
    saveTx(record)
    setTxHistory(prev => [record, ...prev].slice(0, 200))
  }

  // ── MiniKit send helper ──────────────────────────────────────────────────
  async function sendTx(transaction: object[], permit2Payload?: object[]) {
    if (!MiniKit.isInstalled()) throw new Error('Debes abrir la app dentro de World App')
    const payload: any = { transaction }
    if (permit2Payload) payload.permit2 = permit2Payload
    const result = await MiniKit.commandsAsync.sendTransaction(payload)
    if (result.finalPayload?.status !== 'success') {
      throw new Error(result.finalPayload?.error_code ?? 'Transacción rechazada')
    }
    return result.finalPayload
  }

  // ── STAKE ────────────────────────────────────────────────────────────────
  async function handleStake() {
    if (!wallet.address) return toast('Conecta tu wallet primero', 'error')
    const amt = parseFloat(stakeAmt)
    if (!amt || amt <= 0) return toast('Ingresa una cantidad válida', 'error')
    const gross = ethers.parseUnits(stakeAmt, 18)
    const nonce = randomNonce()
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800)

    toast('Enviando stake...', 'info')
    try {
      const payload = await sendTx(
        [{
          address: STAKING_CONTRACT,
          abi: [{
            name: 'stake', type: 'function', stateMutability: 'nonpayable',
            inputs: [
              { name: 'amount', type: 'uint256' },
              { name: 'permit', type: 'tuple', components: [
                { name: 'permitted', type: 'tuple', components: [
                  { name: 'token', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ]},
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ]},
              { name: 'signature', type: 'bytes' },
            ],
            outputs: [],
          }],
          functionName: 'stake',
          args: [
            gross.toString(),
            { permitted: { token: USG_TOKEN, amount: gross.toString() }, nonce: nonce.toString(), deadline: deadline.toString() },
            '0x',
          ],
        }],
        [{ permitted: { token: USG_TOKEN, amount: gross.toString() }, spender: STAKING_CONTRACT, nonce: nonce.toString(), deadline: deadline.toString() }],
      )
      const commission = (gross * BigInt(poolStats?.commissionBps ?? 500n)) / 10000n
      addTx({ type: 'stake', amount: gross, netAmount: gross - commission, commission, hash: (payload as any).transaction_id, status: 'success', user: wallet.address })
      toast(`Stake de ${formatToken(gross)} USG exitoso`, 'success')
      setStakeAmt('')
      setTimeout(refresh, 3000)
    } catch (e: any) {
      toast(e.message ?? 'Error en stake', 'error')
      addTx({ type: 'stake', amount: gross, status: 'failed', user: wallet.address })
    }
  }

  // ── UNSTAKE ──────────────────────────────────────────────────────────────
  async function handleUnstake() {
    if (!wallet.address) return toast('Conecta tu wallet primero', 'error')
    const amt = parseFloat(unstakeAmt)
    if (!amt || amt <= 0) return toast('Ingresa una cantidad válida', 'error')
    const gross = ethers.parseUnits(unstakeAmt, 18)

    toast('Enviando unstake...', 'info')
    try {
      const payload = await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'unstake', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] }],
        functionName: 'unstake',
        args: [gross.toString()],
      }])
      const commission = (gross * BigInt(poolStats?.commissionBps ?? 500n)) / 10000n
      addTx({ type: 'unstake', amount: gross, netAmount: gross - commission, commission, hash: (payload as any).transaction_id, status: 'success', user: wallet.address })
      toast(`Unstake de ${formatToken(gross)} USG exitoso`, 'success')
      setUnstakeAmt('')
      setTimeout(refresh, 3000)
    } catch (e: any) {
      toast(e.message ?? 'Error en unstake', 'error')
      addTx({ type: 'unstake', amount: ethers.parseUnits(unstakeAmt || '0', 18), status: 'failed', user: wallet.address })
    }
  }

  // ── CLAIM ────────────────────────────────────────────────────────────────
  async function handleClaim() {
    if (!wallet.address) return toast('Conecta tu wallet primero', 'error')
    const pending = userInfo?.pendingRewards ?? 0n
    if (pending === 0n) return toast('No tienes recompensas pendientes', 'error')

    toast('Reclamando recompensas...', 'info')
    try {
      const payload = await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'claim', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }],
        functionName: 'claim',
        args: [],
      }])
      addTx({ type: 'claim', amount: pending, hash: (payload as any).transaction_id, status: 'success', user: wallet.address })
      toast(`Recompensas reclamadas: ${formatToken(pending)} USG`, 'success')
      setTimeout(refresh, 3000)
    } catch (e: any) {
      toast(e.message ?? 'Error al reclamar', 'error')
    }
  }

  // ── FUND (Permit2) ───────────────────────────────────────────────────────
  async function handleFund() {
    if (!wallet.address) return toast('Conecta tu wallet primero', 'error')
    const amt = parseFloat(fundAmt)
    if (!amt || amt <= 0) return toast('Ingresa una cantidad válida', 'error')
    const amount = ethers.parseUnits(fundAmt, 18)
    const nonce = randomNonce()
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800)

    toast('Fondeando el pool...', 'info')
    try {
      const payload = await sendTx(
        [{
          address: STAKING_CONTRACT,
          abi: [{
            name: 'fund', type: 'function', stateMutability: 'nonpayable',
            inputs: [
              { name: 'amount', type: 'uint256' },
              { name: 'permit', type: 'tuple', components: [
                { name: 'permitted', type: 'tuple', components: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }]},
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' },
              ]},
              { name: 'signature', type: 'bytes' },
            ],
            outputs: [],
          }],
          functionName: 'fund',
          args: [
            amount.toString(),
            { permitted: { token: USG_TOKEN, amount: amount.toString() }, nonce: nonce.toString(), deadline: deadline.toString() },
            '0x',
          ],
        }],
        [{ permitted: { token: USG_TOKEN, amount: amount.toString() }, spender: STAKING_CONTRACT, nonce: nonce.toString(), deadline: deadline.toString() }],
      )
      addTx({ type: 'fund', amount, hash: (payload as any).transaction_id, status: 'success', user: wallet.address })
      toast(`Pool fondeado con ${formatToken(amount)} USG`, 'success')
      setFundAmt('')
      setTimeout(refresh, 3000)
    } catch (e: any) {
      toast(e.message ?? 'Error al fondear', 'error')
    }
  }

  // ── CLAIM OWNER COMMISSION ──────────────────────────────────────────────
  async function handleClaimOwnerCommission() {
    const bal = ownerDetails?.commissionBalance ?? 0n
    if (bal === 0n) return toast('No tienes comisión pendiente', 'error')
    toast('Reclamando comisión...', 'info')
    try {
      const payload = await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'claimOwnerCommission', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }],
        functionName: 'claimOwnerCommission',
        args: [],
      }])
      addTx({ type: 'owner_claim', amount: bal, hash: (payload as any).transaction_id, status: 'success', user: wallet.address })
      toast(`Comisión reclamada: ${formatToken(bal)} USG`, 'success')
      setTimeout(refresh, 3000)
    } catch (e: any) {
      toast(e.message ?? 'Error al reclamar comisión', 'error')
    }
  }

  // ── ADMIN: Set commission ──────────────────────────────────────────────
  async function handleSetCommission() {
    const bps = parseFloat(newCommission) * 100
    if (isNaN(bps) || bps < 0 || bps > 2000) return toast('Comisión inválida (0–20%)', 'error')
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'setCommission', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'newBps', type: 'uint256' }], outputs: [] }],
        functionName: 'setCommission',
        args: [Math.round(bps).toString()],
      }])
      toast(`Comisión actualizada a ${newCommission}%`, 'success')
      setNewCommission('')
      setTimeout(refresh, 3000)
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── ADMIN: Pause/Unpause ──────────────────────────────────────────────
  async function handlePause(pause: boolean) {
    const fn = pause ? 'pause' : 'unpause'
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: fn, type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }],
        functionName: fn,
        args: [],
      }])
      toast(pause ? 'Contrato pausado' : 'Contrato reanudado', 'success')
      setTimeout(refresh, 2000)
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── ADMIN: Add owner ──────────────────────────────────────────────────
  async function handleAddOwner() {
    if (!ethers.isAddress(newOwnerAddr)) return toast('Dirección inválida', 'error')
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'addOwner', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [] }],
        functionName: 'addOwner',
        args: [newOwnerAddr],
      }])
      toast(`Owner agregado: ${shortenAddress(newOwnerAddr)}`, 'success')
      setNewOwnerAddr('')
      setTimeout(refresh, 3000)
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── ADMIN: Remove owner ───────────────────────────────────────────────
  async function handleRemoveOwner() {
    if (!ethers.isAddress(removeOwnerAddr)) return toast('Dirección inválida', 'error')
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'removeOwner', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'target', type: 'address' }], outputs: [] }],
        functionName: 'removeOwner',
        args: [removeOwnerAddr],
      }])
      toast(`Owner eliminado: ${shortenAddress(removeOwnerAddr)}`, 'success')
      setRemoveOwnerAddr('')
      setTimeout(refresh, 3000)
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── ADMIN: Withdraw from pool ────────────────────────────────────────
  async function handleWithdrawPool() {
    if (!withdrawTo || !ethers.isAddress(withdrawTo)) return toast('Dirección de destino inválida', 'error')
    const amt = parseFloat(withdrawAmt)
    if (!amt || amt <= 0) return toast('Cantidad inválida', 'error')
    const amount = ethers.parseUnits(withdrawAmt, 18)
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'withdrawRewardPool', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }], outputs: [] }],
        functionName: 'withdrawRewardPool',
        args: [amount.toString(), withdrawTo],
      }])
      addTx({ type: 'fund', amount, status: 'success', user: wallet.address ?? '' })
      toast(`Retirado ${formatToken(amount)} USG del pool`, 'success')
      setWithdrawAmt(''); setWithdrawTo('')
      setTimeout(refresh, 3000)
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── ADMIN: Recover ERC20 ──────────────────────────────────────────────
  async function handleRecoverERC20() {
    if (!ethers.isAddress(recoverToken)) return toast('Dirección de token inválida', 'error')
    const amt = parseFloat(recoverAmt)
    if (!amt || amt <= 0) return toast('Cantidad inválida', 'error')
    const amount = ethers.parseUnits(recoverAmt, 18)
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'recoverERC20', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] }],
        functionName: 'recoverERC20',
        args: [recoverToken, amount.toString()],
      }])
      toast('Token ERC20 recuperado', 'success')
      setRecoverToken(''); setRecoverAmt('')
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── ADMIN: Recover ETH ───────────────────────────────────────────────
  async function handleRecoverETH() {
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'recoverETH', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }],
        functionName: 'recoverETH',
        args: [],
      }])
      toast('ETH recuperado exitosamente', 'success')
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── ADMIN: Remove inactive stakers ──────────────────────────────────
  async function handleRemoveInactive() {
    try {
      await sendTx([{
        address: STAKING_CONTRACT,
        abi: [{ name: 'removeInactiveStakers', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }],
        functionName: 'removeInactiveStakers',
        args: [],
      }])
      toast('Stakers inactivos eliminados', 'success')
      setTimeout(refresh, 2000)
    } catch (e: any) { toast(e.message ?? 'Error', 'error') }
  }

  // ── Owner name edit ─────────────────────────────────────────────────
  function saveOwnerName(addr: string, name: string) {
    const updated = { ...ownerNames, [addr.toLowerCase()]: name }
    setOwnerNames(updated)
    saveOwnerNames(updated)
  }
  function getOwnerName(addr: string): string {
    if (!addr) return 'Desconocido'
    const low = addr.toLowerCase()
    if (ownerNames[low]) return ownerNames[low]
    if (owner1Addr && low === owner1Addr.toLowerCase()) return 'Deployer (Owner 1)'
    if (low === OWNER2_ADDRESS.toLowerCase()) return 'Admin (Owner 2)'
    return shortenAddress(addr)
  }

  // ── Render gates ────────────────────────────────────────────────────
  if (isInstalled === null) return <LoadingScreen />
  if (!isInstalled) return <NotInstalled />
  if (!wallet.address) return (
    <ConnectScreen onConnect={wallet.connect} loading={wallet.isConnecting} />
  )

  const isAdminOwner = wallet.isOwner1 || wallet.isOwner2

  // ─── Main UI ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative" style={{ background: 'linear-gradient(180deg,#0a0f1e 0%,#070d1a 100%)' }}>
      {/* Full background image */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img src="/bg-usg.jpg" alt="" className="w-full h-full object-cover opacity-10" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(10,15,30,0.7) 0%,rgba(7,13,26,0.95) 100%)' }} />
      </div>

      <div className="relative z-10 max-w-lg mx-auto">
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-20 bg-black/70 backdrop-blur-md border-b border-yellow-500/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-yellow-500/60">
                <img src="/bg-usg.jpg" alt="USG" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-yellow-400 leading-none">Unity Stake Global</p>
                <p className="text-xs text-yellow-600 leading-none mt-0.5">$USG · World Chain</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {poolStats?.paused && (
                <span className="text-xs bg-red-900/60 text-red-400 border border-red-500/40 px-2 py-0.5 rounded-full">PAUSADO</span>
              )}
              <button onClick={refresh} disabled={loading}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </button>
              <div className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1">
                {wallet.isOwner2 && <Star className="w-3 h-3 text-yellow-400" />}
                {wallet.isOwner1 && <Shield className="w-3 h-3 text-blue-400" />}
                {wallet.isAnyOwner && !wallet.isOwner1 && !wallet.isOwner2 && <UserCheck className="w-3 h-3 text-purple-400" />}
                <span className="text-xs text-white font-mono">{shortenAddress(wallet.address)}</span>
              </div>
            </div>
          </div>
          {/* Role badge */}
          {wallet.isOwner2 && (
            <div className="mt-2 flex justify-end">
              <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2.5 py-0.5 rounded-full font-bold">
                Admin Principal (Owner 2)
              </span>
            </div>
          )}
          {wallet.isOwner1 && (
            <div className="mt-2 flex justify-end">
              <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-bold">
                Deployer (Owner 1)
              </span>
            </div>
          )}
          {wallet.isAnyOwner && !wallet.isOwner1 && !wallet.isOwner2 && (
            <div className="mt-2 flex justify-end">
              <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-bold">
                Owner Dev
              </span>
            </div>
          )}
        </header>

        <div className="px-4 py-4 pb-24">

          {/* ══════════════════════════════════════════════
              PANEL 1: ESTADÍSTICAS GLOBALES
          ══════════════════════════════════════════════ */}
          <Panel>
            <PanelTitle
              icon={<BarChart3 className="w-4 h-4 text-yellow-400" />}
              right={
                <button onClick={() => setShowStats(p => !p)} className="text-slate-400 hover:text-white">
                  {showStats ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              }
            >
              Estadísticas Globales
            </PanelTitle>

            {showStats && (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <StatCard label="Total Stakeado" value={poolStats ? formatToken(poolStats.totalStaked) + ' USG' : '—'} color="yellow" />
                  <StatCard label="Fondo del Stake" value={poolStats ? formatToken(poolStats.rewardPool) + ' USG' : '—'} color="green" />
                  <StatCard label="APR Actual" value={poolStats ? formatAPR(poolStats.currentAPR) : '—'} sub="Máx 20,000%" color="cyan" />
                  <StatCard label="Comisión Sistema" value={poolStats ? bpsToPercent(poolStats.commissionBps) : '5.00%'} sub="2.5% pool + 2.5% devs" color="purple" />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <StatCard label="Total Reclamado" value={poolStats ? formatToken(poolStats.totalClaimed) + ' USG' : '—'} color="blue" />
                  <StatCard label="Total Fondeado" value={poolStats ? formatToken(poolStats.totalDeposited) + ' USG' : '—'} color="green" />
                  <StatCard label="Total Retirado" value={poolStats ? formatToken(poolStats.totalWithdrawn) + ' USG' : '—'} color="white" />
                  <StatCard label="Total Comisiones" value={poolStats ? formatToken(poolStats.totalGainedCommission) + ' USG' : '—'} color="yellow" />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <StatCard label="Stakers Activos" value={poolStats ? poolStats.stakerCount.toString() : '—'} color="cyan" />
                  <StatCard label="Owner Devs" value={poolStats ? poolStats.ownerCount.toString() : '—'} color="purple" />
                  <StatCard label="Estado" value={poolStats?.paused ? 'PAUSADO' : 'ACTIVO'} color={poolStats?.paused ? 'red' : 'green'} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Al Pool (comisión)" value={poolStats ? formatToken(poolStats.totalCommissionPool) + ' USG' : '—'} color="green" />
                  <StatCard label="A Devs (comisión)" value={poolStats ? formatToken(poolStats.totalCommissionOwners) + ' USG' : '—'} color="purple" />
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Contrato USG</span>
                  <a href={`https://worldscan.org/address/${STAKING_CONTRACT}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-yellow-500 hover:text-yellow-400 font-mono">
                    {shortenAddress(STAKING_CONTRACT)} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </>
            )}
          </Panel>

          {/* ══════════════════════════════════════════════
              PANEL 2: MI STAKE
          ══════════════════════════════════════════════ */}
          <Panel>
            <PanelTitle
              icon={<Coins className="w-4 h-4 text-yellow-400" />}
              right={
                <button onClick={() => setShowStake(p => !p)} className="text-slate-400 hover:text-white">
                  {showStake ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              }
            >
              Mi Stake
            </PanelTitle>

            {showStake && (
              <>
                {/* User stats */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <StatCard label="Mi Balance USG" value={formatToken(usgBalance) + ' USG'} color="white" />
                  <StatCard label="En Stake" value={userInfo ? formatToken(userInfo.stakedAmount) + ' USG' : '0 USG'} color="yellow" />
                  <StatCard label="Recompensas Pendientes" value={userInfo ? formatToken(userInfo.pendingRewards) + ' USG' : '0 USG'} color="green" />
                  <StatCard label="Total Ganado" value={userInfo ? formatToken(userInfo.totalEarned) + ' USG' : '0 USG'} color="cyan" />
                </div>

                {/* Owner commission row */}
                {ownerDetails?.isOwner && (
                  <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-xs font-bold text-purple-400">Comisión Dev Pendiente</span>
                      </div>
                      <span className="text-sm font-bold text-purple-300">
                        {formatToken(ownerDetails.commissionBalance)} USG
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mb-2">
                      Total histórico reclamado: <span className="text-purple-300">{formatToken(ownerDetails.totalClaimed)} USG</span>
                    </div>
                    {ownerDetails.commissionBalance > 0n && (
                      <Button size="sm" onClick={handleClaimOwnerCommission}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs h-8">
                        <Gift className="w-3.5 h-3.5 mr-1.5" />
                        Reclamar Comisión
                      </Button>
                    )}
                  </div>
                )}

                {/* Stake action */}
                <div className="mb-3">
                  <p className="text-xs text-slate-400 mb-1.5 font-medium">Stakear USG</p>
                  <div className="flex gap-2">
                    <Input
                      type="number" min="1" step="any"
                      placeholder="Cantidad USG (mín. 1)"
                      value={stakeAmt}
                      onChange={e => setStakeAmt(e.target.value)}
                      className="flex-1 h-10 bg-white/5 border-white/10 text-white text-sm placeholder:text-slate-500"
                    />
                    <Button onClick={handleStake} disabled={poolStats?.paused}
                      className="h-10 px-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm whitespace-nowrap">
                      <ArrowDownToLine className="w-4 h-4 mr-1" /> Stakear
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Comisión: {bpsToPercent(poolStats?.commissionBps ?? 500n)} · APR: {formatAPR(poolStats?.currentAPR ?? 0n)}
                  </p>
                </div>

                {/* Unstake action */}
                <div className="mb-3">
                  <p className="text-xs text-slate-400 mb-1.5 font-medium">Retirar del Stake</p>
                  <div className="flex gap-2">
                    <Input
                      type="number" min="0" step="any"
                      placeholder="Cantidad a retirar"
                      value={unstakeAmt}
                      onChange={e => setUnstakeAmt(e.target.value)}
                      className="flex-1 h-10 bg-white/5 border-white/10 text-white text-sm placeholder:text-slate-500"
                    />
                    <Button onClick={handleUnstake} disabled={poolStats?.paused}
                      variant="outline"
                      className="h-10 px-4 border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm whitespace-nowrap">
                      <ArrowUpFromLine className="w-4 h-4 mr-1" /> Retirar
                    </Button>
                  </div>
                  {userInfo && userInfo.stakedAmount > 0n && (
                    <button className="text-xs text-yellow-500 mt-1 hover:text-yellow-400"
                      onClick={() => setUnstakeAmt(ethers.formatUnits(userInfo.stakedAmount, 18))}>
                      Max: {formatToken(userInfo.stakedAmount)} USG
                    </button>
                  )}
                </div>

                {/* Claim action */}
                <Button onClick={handleClaim}
                  disabled={poolStats?.paused || (userInfo?.pendingRewards ?? 0n) === 0n}
                  className="w-full h-10 bg-green-600 hover:bg-green-500 text-white font-bold text-sm">
                  <Gift className="w-4 h-4 mr-2" />
                  Reclamar Recompensas ({formatToken(userInfo?.pendingRewards ?? 0n)} USG)
                </Button>

                {poolStats?.paused && (
                  <p className="text-xs text-red-400 text-center mt-2">El contrato está pausado. Las operaciones no están disponibles.</p>
                )}
              </>
            )}
          </Panel>

          {/* ══════════════════════════════════════════════
              PANEL 3: HISTORIAL DE TRANSACCIONES
          ══════════════════════════════════════════════ */}
          <Panel>
            <PanelTitle
              icon={<History className="w-4 h-4 text-yellow-400" />}
              right={
                <button onClick={() => setShowHistory(p => !p)} className="text-slate-400 hover:text-white">
                  {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              }
            >
              Historial de Transacciones
            </PanelTitle>

            {showHistory && (
              <>
                {txHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Sin transacciones registradas aún</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                    {txHistory.map((tx, i) => {
                      const typeLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                        stake:       { label: 'Stake',       color: 'text-yellow-400', icon: <ArrowDownToLine className="w-3 h-3" /> },
                        unstake:     { label: 'Unstake',     color: 'text-red-400',    icon: <ArrowUpFromLine className="w-3 h-3" /> },
                        claim:       { label: 'Recompensa',  color: 'text-green-400',  icon: <Gift className="w-3 h-3" /> },
                        fund:        { label: 'Fondeo',      color: 'text-blue-400',   icon: <PiggyBank className="w-3 h-3" /> },
                        owner_claim: { label: 'Comisión Dev',color: 'text-purple-400', icon: <Trophy className="w-3 h-3" /> },
                        commission:  { label: 'Comisión',    color: 'text-purple-400', icon: <DollarSign className="w-3 h-3" /> },
                      }
                      const meta = typeLabels[tx.type] ?? { label: tx.type, color: 'text-slate-400', icon: null }
                      return (
                        <div key={i} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/3 px-3 py-2">
                          <div className={cn('shrink-0', meta.color)}>{meta.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={cn('text-xs font-bold', meta.color)}>{meta.label}</span>
                              <span className={cn('text-xs px-1.5 py-0.5 rounded-full',
                                tx.status === 'success' ? 'bg-green-900/50 text-green-400' :
                                tx.status === 'failed'  ? 'bg-red-900/50 text-red-400' :
                                'bg-yellow-900/50 text-yellow-400'
                              )}>{tx.status === 'success' ? '✓' : tx.status === 'failed' ? '✗' : '…'}</span>
                            </div>
                            <p className="text-xs text-slate-400">{formatDate(tx.timestamp)}</p>
                            {tx.user && <p className="text-xs text-slate-600 font-mono truncate">{shortenAddress(tx.user)}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-white">{formatToken(tx.amount, 18, 4)} USG</p>
                            {tx.netAmount && <p className="text-xs text-slate-500">Neto: {formatToken(tx.netAmount, 18, 4)}</p>}
                            {tx.hash && (
                              <a href={`https://worldscan.org/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-yellow-500 hover:text-yellow-400">
                                <ExternalLink className="w-3 h-3 inline" />
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </Panel>

          {/* ══════════════════════════════════════════════
              PANEL 4: FONDEAR EL STAKE
          ══════════════════════════════════════════════ */}
          <Panel>
            <PanelTitle
              icon={<PiggyBank className="w-4 h-4 text-yellow-400" />}
              right={
                <button onClick={() => setShowFund(p => !p)} className="text-slate-400 hover:text-white">
                  {showFund ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              }
            >
              Fondear el Pool
            </PanelTitle>

            {showFund && (
              <>
                {/* Fund image */}
                <div className="rounded-xl overflow-hidden mb-4 border border-yellow-500/20">
                  <img src="/fund-usg.jpg" alt="Unity Stake Global — Fondeemos juntos" className="w-full object-cover max-h-48" />
                </div>
                <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-300 leading-relaxed">
                  <strong className="text-blue-200">¿Quién puede fondear?</strong> Cualquier usuario y cualquier owner puede fondear el pool.
                  Al fondear, aumentas el APR para todos los stakers. 100% de tu aportación va al fondo de recompensas.
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number" min="0" step="any"
                    placeholder="Cantidad USG a fondear"
                    value={fundAmt}
                    onChange={e => setFundAmt(e.target.value)}
                    className="flex-1 h-10 bg-white/5 border-white/10 text-white text-sm placeholder:text-slate-500"
                  />
                  <Button onClick={handleFund}
                    className="h-10 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm whitespace-nowrap">
                    <PiggyBank className="w-4 h-4 mr-1" /> Fondear
                  </Button>
                </div>
                {fundAmt && parseFloat(fundAmt) > 0 && (
                  <p className="text-xs text-slate-400 mt-2">
                    Fondeando <span className="text-white font-bold">{fundAmt} USG</span> → 100% va al pool de recompensas
                  </p>
                )}
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Fondo actual</span>
                    <span className="text-xs font-bold text-green-400">{poolStats ? formatToken(poolStats.rewardPool) : '—'} USG</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-500">APR actual</span>
                    <span className="text-xs font-bold text-cyan-400">{poolStats ? formatAPR(poolStats.currentAPR) : '—'}</span>
                  </div>
                </div>
                <div className="mt-3">
                  <a href={BUY_LINK} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 text-xs text-yellow-500 hover:text-yellow-400 border border-yellow-500/30 rounded-lg py-2 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Comprar $USG en Ani Launchpad
                  </a>
                </div>
              </>
            )}
          </Panel>

          {/* ══════════════════════════════════════════════
              PANEL 5: OWNERS / DEV TEAM
              Visible para todos (estadísticas públicas)
          ══════════════════════════════════════════════ */}
          <Panel>
            <PanelTitle icon={<Users className="w-4 h-4 text-purple-400" />}>
              Dev Team — Owners ({owners.length}/100)
            </PanelTitle>
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {owners.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">Sin owners registrados</p>
              )}
              {owners.map((addr, i) => {
                const isO1 = owner1Addr && addr.toLowerCase() === owner1Addr.toLowerCase()
                const isO2 = addr.toLowerCase() === OWNER2_ADDRESS.toLowerCase()
                const name = getOwnerName(addr)
                return (
                  <div key={addr} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/3 px-3 py-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                      {isO1 ? <Shield className="w-3 h-3 text-blue-400" /> :
                       isO2 ? <Star className="w-3 h-3 text-yellow-400" /> :
                       <UserCheck className="w-3 h-3 text-purple-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{name}</p>
                      <p className="text-xs text-slate-500 font-mono truncate">{shortenAddress(addr)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {isO1 && <span className="text-xs text-blue-400 font-bold">Deployer</span>}
                      {isO2 && <span className="text-xs text-yellow-400 font-bold">Admin</span>}
                      {!isO1 && !isO2 && <span className="text-xs text-purple-400">Dev #{i + 1}</span>}
                    </div>
                    {/* Edit name — solo para owner1/owner2 */}
                    {isAdminOwner && (
                      <button onClick={() => { setEditingAddr(addr); setEditingName(ownerNames[addr.toLowerCase()] ?? '') }}
                        className="text-slate-500 hover:text-yellow-400">
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Edit name modal inline */}
            {editingAddr && (
              <div className="mt-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-xs text-yellow-400 font-bold mb-2">Nombre para {shortenAddress(editingAddr)}</p>
                <div className="flex gap-2">
                  <Input value={editingName} onChange={e => setEditingName(e.target.value)}
                    placeholder="Ej: Dev Team México"
                    className="flex-1 h-8 bg-black/40 border-yellow-500/30 text-white text-xs" />
                  <Button size="sm" onClick={() => { saveOwnerName(editingAddr, editingName); setEditingAddr(null) }}
                    className="h-8 px-3 bg-yellow-500 text-black font-bold text-xs">Guardar</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingAddr(null)}
                    className="h-8 px-3 border-white/20 text-slate-400 text-xs">✕</Button>
                </div>
              </div>
            )}
          </Panel>

          {/* ══════════════════════════════════════════════
              PANEL 6: CONFIGURACIÓN (Owner2 / any owner)
          ══════════════════════════════════════════════ */}
          {wallet.isAnyOwner && (
            <Panel>
              <PanelTitle
                icon={<Settings className="w-4 h-4 text-yellow-400" />}
                right={
                  <button onClick={() => setShowOwnerConfig(p => !p)} className="text-slate-400 hover:text-white">
                    {showOwnerConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                }
              >
                Panel de Configuración
              </PanelTitle>

              {showOwnerConfig && (
                <div className="flex flex-col gap-3">
                  {/* Commission */}
                  {isAdminOwner && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1.5 font-medium">
                        Comisión actual: <span className="text-yellow-400">{bpsToPercent(poolStats?.commissionBps ?? 500n)}</span>
                      </p>
                      <div className="flex gap-2">
                        <Input type="number" min="0" max="20" step="0.01"
                          placeholder="Nueva comisión % (0–20)"
                          value={newCommission} onChange={e => setNewCommission(e.target.value)}
                          className="flex-1 h-9 bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500" />
                        <Button size="sm" onClick={handleSetCommission}
                          className="h-9 px-3 bg-yellow-500 text-black font-bold text-xs">Aplicar</Button>
                      </div>
                    </div>
                  )}

                  {/* Pause/Unpause */}
                  {isAdminOwner && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handlePause(true)} disabled={poolStats?.paused}
                        className="flex-1 h-9 bg-red-600/80 hover:bg-red-600 text-white text-xs">
                        <Lock className="w-3.5 h-3.5 mr-1" /> Pausar Contrato
                      </Button>
                      <Button size="sm" onClick={() => handlePause(false)} disabled={!poolStats?.paused}
                        className="flex-1 h-9 bg-green-700/80 hover:bg-green-700 text-white text-xs">
                        Reanudar Contrato
                      </Button>
                    </div>
                  )}

                  {/* Remove inactive stakers */}
                  <Button size="sm" onClick={handleRemoveInactive}
                    variant="outline" className="w-full h-9 border-white/10 text-slate-400 hover:text-white text-xs">
                    <Minus className="w-3.5 h-3.5 mr-1" /> Limpiar Stakers Inactivos
                  </Button>

                  {/* Stats summary */}
                  <div className="rounded-xl border border-white/5 bg-white/3 p-3 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-slate-500">Pool retirado</p>
                      <p className="text-xs font-bold text-red-400">{poolStats ? formatToken(poolStats.totalPoolWithdrawn) : '—'} USG</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Balance contrato</p>
                      <p className="text-xs font-bold text-green-400">Ver en explorer</p>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          )}

          {/* ══════════════════════════════════════════════
              PANEL 7: PANEL SECRETO — SOLO OWNER1 + OWNER2
              Gestión de owners + retiro de fondos
              INVISIBLE para otros usuarios/owners
          ══════════════════════════════════════════════ */}
          {isAdminOwner && (
            <Panel className="border-yellow-500/40 bg-yellow-500/5">
              <PanelTitle
                icon={<Lock className="w-4 h-4 text-yellow-400" />}
                right={
                  <button onClick={() => setShowAdminSecret(p => !p)} className="text-slate-400 hover:text-white">
                    {showAdminSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              >
                <span className="text-yellow-400">Panel Admin Exclusivo</span>
                <span className="ml-2 text-xs font-normal text-yellow-600">(solo Owner1/Owner2)</span>
              </PanelTitle>

              {showAdminSecret && (
                <div className="flex flex-col gap-4">

                  {/* ── GESTIÓN DE OWNERS ─────────── */}
                  <div>
                    <p className="text-xs font-bold text-purple-400 mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Gestión de Owners
                    </p>
                    <div className="flex gap-2 mb-2">
                      <Input placeholder="Dirección del nuevo owner"
                        value={newOwnerAddr} onChange={e => setNewOwnerAddr(e.target.value)}
                        className="flex-1 h-9 bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500" />
                      <Button size="sm" onClick={handleAddOwner}
                        className="h-9 px-3 bg-purple-600 hover:bg-purple-500 text-white text-xs whitespace-nowrap">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="Dirección owner a eliminar"
                        value={removeOwnerAddr} onChange={e => setRemoveOwnerAddr(e.target.value)}
                        className="flex-1 h-9 bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500" />
                      <Button size="sm" onClick={handleRemoveOwner}
                        variant="outline"
                        className="h-9 px-3 border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs whitespace-nowrap">
                        <Minus className="w-3.5 h-3.5 mr-1" /> Eliminar
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">No se puede eliminar Owner1 ni Owner2. Max 100 owners.</p>
                  </div>

                  {/* ── RETIRO DEL POOL ───────────── */}
                  <div>
                    <p className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1.5">
                      <ArrowUpFromLine className="w-3.5 h-3.5" /> Retirar del Pool de Recompensas
                    </p>
                    <p className="text-xs text-slate-500 mb-2">Pool disponible: <span className="text-green-400">{poolStats ? formatToken(poolStats.rewardPool) : '—'} USG</span></p>
                    <div className="flex flex-col gap-2">
                      <Input type="number" placeholder="Cantidad USG a retirar"
                        value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                        className="h-9 bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500" />
                      <Input placeholder="Dirección destino"
                        value={withdrawTo} onChange={e => setWithdrawTo(e.target.value)}
                        className="h-9 bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500" />
                      <Button size="sm" onClick={handleWithdrawPool}
                        className="h-9 bg-red-600/80 hover:bg-red-600 text-white text-xs">
                        Retirar del Pool
                      </Button>
                    </div>
                  </div>

                  {/* ── RECUPERAR ERC20 ───────────── */}
                  <div>
                    <p className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5" /> Recuperar ERC20 enviado por error
                    </p>
                    <div className="flex flex-col gap-2">
                      <Input placeholder="Dirección del token ERC20"
                        value={recoverToken} onChange={e => setRecoverToken(e.target.value)}
                        className="h-9 bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500" />
                      <Input type="number" placeholder="Cantidad a recuperar"
                        value={recoverAmt} onChange={e => setRecoverAmt(e.target.value)}
                        className="h-9 bg-white/5 border-white/10 text-white text-xs placeholder:text-slate-500" />
                      <Button size="sm" onClick={handleRecoverERC20}
                        variant="outline"
                        className="h-9 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 text-xs">
                        Recuperar Token
                      </Button>
                    </div>
                  </div>

                  {/* ── RECUPERAR ETH ─────────────── */}
                  <div>
                    <p className="text-xs font-bold text-cyan-400 mb-2 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Recuperar ETH del Contrato
                    </p>
                    <Button size="sm" onClick={handleRecoverETH}
                      variant="outline"
                      className="w-full h-9 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 text-xs">
                      Recuperar todo el ETH
                    </Button>
                  </div>

                  {/* ── PERFIL DEL ADMIN ──────────── */}
                  <div className="rounded-xl border border-white/5 bg-white/3 p-3">
                    <p className="text-xs font-bold text-yellow-400 mb-2">Tu Perfil Admin</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-slate-500">Tu dirección</p>
                        <p className="text-xs font-mono text-white">{shortenAddress(wallet.address)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Rol</p>
                        <p className="text-xs font-bold text-yellow-400">{wallet.isOwner2 ? 'Admin (Owner 2)' : 'Deployer (Owner 1)'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Comisión pendiente</p>
                        <p className="text-xs font-bold text-purple-400">{formatToken(ownerDetails?.commissionBalance ?? 0n)} USG</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Total reclamado</p>
                        <p className="text-xs font-bold text-green-400">{formatToken(ownerDetails?.totalClaimed ?? 0n)} USG</p>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </Panel>
          )}

          {/* ── Footer ─────────────────────────────────────── */}
          <div className="text-center pt-2 pb-6">
            <p className="text-xs text-slate-600">Unity Stake Global — $USG · World Chain (480)</p>
            <p className="text-xs text-slate-700 mt-0.5">Juntos construimos. Juntos crecemos. Juntos ganamos.</p>
            <a href={BUY_LINK} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-500 mt-1">
              <ExternalLink className="w-3 h-3" /> Comprar $USG en Ani Launchpad
            </a>
          </div>

        </div>
      </div>

      {/* Toast container */}
      <ToastContainer toasts={toasts} />
    </div>
  )
}

import { ethers } from 'ethers'

// ─── Direcciones ──────────────────────────────────────────────────────────────
// NOTA: Actualiza STAKING_CONTRACT después de hacer deploy del nuevo contrato
export const STAKING_CONTRACT = '0x0000000000000000000000000000000000000000' // Pendiente deploy
export const USG_TOKEN        = '0x4E6791bAc7c2E8c52543C3EA85D1C66a917206b5'
export const PERMIT2_ADDRESS  = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
export const WORLD_CHAIN_RPC  = 'https://worldchain-mainnet.g.alchemy.com/public'
export const WORLD_CHAIN_ID   = 480
export const OWNER1_ADDRESS   = '' // Dirección del deployer (se lee del contrato)
export const OWNER2_ADDRESS   = '0xc2ef127734f296952de75c1b58a6cec605cc2e59'
export const BUY_LINK         = 'https://world.org/mini-app?app_id=app_4593f73390a9843503ec096086b43612&path=/launchpad/token/0x4E6791bAc7c2E8c52543C3EA85D1C66a917206b5'

// ─── ABI del nuevo contrato UnityStakeGlobal ─────────────────────────────────
export const STAKING_ABI = [
  // Immutables
  'function USG() view returns (address)',
  'function permit2() view returns (address)',
  'function owner1() view returns (address)',
  'function owner2() view returns (address)',
  // Config
  'function commissionBps() view returns (uint256)',
  'function MAX_COMMISSION_BPS() view returns (uint256)',
  'function MAX_APR_BPS() view returns (uint256)',
  'function MIN_STAKE_AMOUNT() view returns (uint256)',
  // Staking state
  'function totalStaked() view returns (uint256)',
  'function rewardPool() view returns (uint256)',
  'function accRewardPerToken() view returns (uint256)',
  'function lastRewardTime() view returns (uint256)',
  'function totalDeposited() view returns (uint256)',
  'function totalClaimed() view returns (uint256)',
  'function totalWithdrawn() view returns (uint256)',
  'function totalGainedCommission() view returns (uint256)',
  'function totalCommissionPool() view returns (uint256)',
  'function totalCommissionOwners() view returns (uint256)',
  'function totalPoolWithdrawn() view returns (uint256)',
  // Owner registry
  'function isOwner(address) view returns (bool)',
  'function ownerCommissionBalance(address) view returns (uint256)',
  'function ownerTotalClaimed(address) view returns (uint256)',
  'function getOwners() view returns (address[])',
  'function getOwnerCount() view returns (uint256)',
  // Staker registry
  'function getStakers() view returns (address[])',
  'function getStakerCount() view returns (uint256)',
  // User info
  'function stakes(address) view returns (uint256 amount, uint256 rewardDebt, uint256 totalEarned)',
  'function pendingReward(address user) view returns (uint256)',
  'function currentAPR() view returns (uint256)',
  'function currentAPRPercent() view returns (uint256 bps, uint256 whole, uint256 decimals2)',
  'function getUserInfo(address user) view returns (uint256 stakedAmount, uint256 pendingRewards, uint256 totalEarned, uint256 tokenBalance, uint256 ownerCommission)',
  'function getPoolStats() view returns (uint256 totalStaked, uint256 rewardPool, uint256 currentAPR, uint256 stakerCount, uint256 ownerCount, uint256 totalDeposited, uint256 totalClaimed, uint256 totalWithdrawn, uint256 totalCommissionPool, uint256 totalCommissionOwners, uint256 totalGainedCommission, uint256 commissionBps, bool paused, uint256 totalPoolWithdrawn)',
  'function getContractBalance() view returns (uint256)',
  'function paused() view returns (bool)',
  // Write — stake/unstake/claim
  'function stake(uint256 amount, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function unstake(uint256 amount)',
  'function claim()',
  // Write — fund
  'function fund(uint256 amount, tuple(tuple(address token, uint256 amount) permitted, uint256 nonce, uint256 deadline) permit, bytes signature)',
  'function directFund(uint256 amount)',
  // Write — owners
  'function claimOwnerCommission()',
  // Write — admin (onlyConfigOwner)
  'function setCommission(uint256 newBps)',
  'function addOwner(address newOwner)',
  'function removeOwner(address target)',
  'function pause()',
  'function unpause()',
  'function withdrawRewardPool(uint256 amount, address to)',
  'function recoverERC20(address token, uint256 amount)',
  'function recoverETH()',
  'function removeInactiveStakers()',
  // Events
  'event Staked(address indexed user, uint256 gross, uint256 net, uint256 commission)',
  'event Unstaked(address indexed user, uint256 gross, uint256 net, uint256 commission)',
  'event RewardClaimed(address indexed user, uint256 gross, uint256 net, uint256 commission)',
  'event Funded(address indexed funder, uint256 amount)',
  'event DirectFunded(address indexed funder, uint256 amount)',
  'event OwnerCommissionClaimed(address indexed owner, uint256 amount)',
  'event OwnerAdded(address indexed by, address indexed newOwner)',
  'event OwnerRemoved(address indexed by, address indexed removedOwner)',
  'event CommissionUpdated(address indexed by, uint256 oldBps, uint256 newBps)',
  'event PoolWithdrawn(address indexed by, uint256 amount, address indexed to)',
  'event ERC20Recovered(address indexed token, uint256 amount, address indexed to)',
  'event ETHRecovered(uint256 amount, address indexed to)',
] as const

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const

// ─── MiniKit ABI Objects ──────────────────────────────────────────────────────
export const PERMIT_TUPLE_INPUT = {
  name: 'permit',
  type: 'tuple',
  internalType: 'struct ISignatureTransfer.PermitTransferFrom',
  components: [
    {
      name: 'permitted',
      type: 'tuple',
      internalType: 'struct ISignatureTransfer.TokenPermissions',
      components: [
        { name: 'token', type: 'address', internalType: 'address' },
        { name: 'amount', type: 'uint256', internalType: 'uint256' },
      ],
    },
    { name: 'nonce', type: 'uint256', internalType: 'uint256' },
    { name: 'deadline', type: 'uint256', internalType: 'uint256' },
  ],
} as const

// ─── Helpers de proveedor ─────────────────────────────────────────────────────
function getProvider() {
  return new ethers.JsonRpcProvider(WORLD_CHAIN_RPC)
}

function getContract() {
  return new ethers.Contract(STAKING_CONTRACT, STAKING_ABI, getProvider())
}

function getERC20(address: string) {
  return new ethers.Contract(address, ERC20_ABI, getProvider())
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface PoolStats {
  totalStaked: bigint
  rewardPool: bigint
  currentAPR: bigint
  stakerCount: bigint
  ownerCount: bigint
  totalDeposited: bigint
  totalClaimed: bigint
  totalWithdrawn: bigint
  totalCommissionPool: bigint
  totalCommissionOwners: bigint
  totalGainedCommission: bigint
  commissionBps: bigint
  paused: boolean
  totalPoolWithdrawn: bigint
}

export interface UserInfo {
  stakedAmount: bigint
  pendingRewards: bigint
  totalEarned: bigint
  tokenBalance: bigint
  ownerCommission: bigint
}

export interface TxRecord {
  type: 'stake' | 'unstake' | 'claim' | 'fund' | 'owner_claim' | 'commission'
  amount: bigint
  netAmount?: bigint
  commission?: bigint
  timestamp: number
  hash?: string
  status: 'pending' | 'success' | 'failed'
  user?: string
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────
export async function fetchPoolStats(): Promise<PoolStats | null> {
  try {
    const c = getContract()
    const res = await c.getPoolStats()
    return {
      totalStaked:           res[0] as bigint,
      rewardPool:            res[1] as bigint,
      currentAPR:            res[2] as bigint,
      stakerCount:           res[3] as bigint,
      ownerCount:            res[4] as bigint,
      totalDeposited:        res[5] as bigint,
      totalClaimed:          res[6] as bigint,
      totalWithdrawn:        res[7] as bigint,
      totalCommissionPool:   res[8] as bigint,
      totalCommissionOwners: res[9] as bigint,
      totalGainedCommission: res[10] as bigint,
      commissionBps:         res[11] as bigint,
      paused:                res[12] as boolean,
      totalPoolWithdrawn:    res[13] as bigint,
    }
  } catch {
    return null
  }
}

export async function fetchUserInfo(user: string): Promise<UserInfo | null> {
  try {
    const c = getContract()
    const res = await c.getUserInfo(user)
    return {
      stakedAmount:   res[0] as bigint,
      pendingRewards: res[1] as bigint,
      totalEarned:    res[2] as bigint,
      tokenBalance:   res[3] as bigint,
      ownerCommission: res[4] as bigint,
    }
  } catch {
    return null
  }
}

export async function fetchOwnerDetails(user: string): Promise<{
  isOwner: boolean
  commissionBalance: bigint
  totalClaimed: bigint
}> {
  try {
    const c = getContract()
    const [isOwner, balance, claimed] = await Promise.all([
      c.isOwner(user),
      c.ownerCommissionBalance(user),
      c.ownerTotalClaimed(user),
    ])
    return { isOwner, commissionBalance: balance as bigint, totalClaimed: claimed as bigint }
  } catch {
    return { isOwner: false, commissionBalance: 0n, totalClaimed: 0n }
  }
}

export async function fetchOwners(): Promise<string[]> {
  try {
    const c = getContract()
    return (await c.getOwners()) as string[]
  } catch {
    return []
  }
}

export async function fetchUSGBalance(user: string): Promise<bigint> {
  try {
    return (await getERC20(USG_TOKEN).balanceOf(user)) as bigint
  } catch {
    return 0n
  }
}

export async function fetchOwner1(): Promise<string | null> {
  try {
    const c = getContract()
    return (await c.owner1()) as string
  } catch {
    return null
  }
}

// ─── Helpers de formato ───────────────────────────────────────────────────────
export function formatToken(amount: bigint, decimals = 18, precision = 4): string {
  try {
    const formatted = ethers.formatUnits(amount, decimals)
    const num = parseFloat(formatted)
    if (num === 0) return '0'
    if (num < 0.0001) return '< 0.0001'
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: precision })
  } catch {
    return '0'
  }
}

export function formatAPR(aprBps: bigint): string {
  const pct = Number(aprBps) / 100
  if (pct >= 10000) return pct.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '%'
  return pct.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

export function bpsToPercent(bps: bigint): string {
  return (Number(bps) / 100).toFixed(2) + '%'
}

export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
